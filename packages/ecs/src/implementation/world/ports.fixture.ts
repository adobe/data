// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { lendBrowserWorkers, lendNodeWorkers, lentWorkers, platformWorkers, type WorkerPlatform } from "./worker-platform.js";
import type { Lent } from "./port.js";
import { simulate } from "./workers.fixture.js";
import { runReported } from "./reports.test-helper.js";

/** Scenarios of workers that die, are lent, or serve a world on a worker, run built in node and from source in chromium. */

const value = Symbol("portsTest/value");
declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
    }
}

const seed = System.create({}, ({ commands }) => {
    for (let i = 0; i < 100_000; i++) commands.spawn([value])({ [value]: i });
});

/** Long enough per row that a task over 100,000 rows is still running when its worker is killed. */
const heavy = System.create({ kernel: true, components: { write: [value] } }, row => {
    let total = row[value];
    for (let k = 0; k < 2000; k++) total = total * 0.5 + k;
    row[value] = total;
});

/** Lends `count` of the platform's workers from this thread, as the main thread lends them to a world on a worker. */
const lend = (count: number) => typeof Worker === "function" ? lendBrowserWorkers(count) : lendNodeWorkers(count);

/**
 * A heavy kernel's run on one worker, killed from outside the pool right after its task is posted: by ending the
 * worker itself (`"exit"`, where the platform reports it) or by the owner that lent it (`"owner"`). The failures of
 * that run and of the next, whose task can only fail, and whether `dispose` then finishes.
 */
export const killedMidTask = async (by: "exit" | "owner", wasm: boolean): Promise<{ readonly first: readonly string[]; readonly second: readonly string[]; readonly disposed: boolean }> => {
    const lending = by === "owner" ? lend(1) : [];
    const base = by === "owner" ? lentWorkers(lending.map(each => each.lent)) : platformWorkers();
    if (base === null) throw new Error("This platform has no workers.");
    const trigger = wasm ? "window" : "run";
    let killed = false;
    const platform: WorkerPlatform = {
        count: 1,
        start: () => {
            const port = base.start();
            if (port === null) return null;
            return {
                ...port,
                post: (message, transfer) => {
                    port.post(message, transfer);
                    if (killed || message.kind !== trigger) return;
                    killed = true;
                    // From outside the pool: the worker itself, or its owner.
                    void (by === "owner" ? lending[0].terminate() : port.terminate());
                },
            };
        },
    };
    const world = createWorld({ [workers]: 1 }, { minimumChunk: 64, wasm, pool: platform });
    await world.run(seed);
    const first = (await runReported(world, heavy)).failures.map(failure => failure.message);
    const second = (await runReported(world, heavy)).failures.map(failure => failure.message);
    const disposed = await Promise.race([world.dispose().then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 20000))]);
    return { first, second, disposed };
};

/** The host worker's messages: run `simulate` with its own nested workers, or with workers this thread lent it. */
export type ToHost = { readonly kind: "nested" } | { readonly kind: "lent"; readonly lent: readonly Lent[] };
export type FromHost = Awaited<ReturnType<typeof simulate>>;

const hostFile = "./world-host.fixture.js";

/** Starts the host worker, posts it one message with these ports to transfer, and resolves with its reply. */
const askHost = (message: ToHost, browserPorts: readonly MessagePort[], nodePorts: readonly import("node:worker_threads").MessagePort[]): Promise<FromHost> => new Promise((resolve, reject) => {
    if (typeof Worker === "function") {
        const host = new Worker(new URL("./world-host.fixture.js", import.meta.url), { type: "module" });
        host.onmessage = (event: MessageEvent<FromHost>) => { host.terminate(); resolve(event.data); };
        host.onerror = event => reject(new Error(event.message));
        host.postMessage(message, [...browserPorts]);
        return;
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const host = new threads.Worker(new URL(hostFile, import.meta.url));
    host.on("message", (reply: FromHost) => { void host.terminate(); resolve(reply); });
    host.on("error", reject);
    host.postMessage(message, [...nodePorts]);
});

/** `simulate(3)` on a world on a worker, its pool workers nested in it. */
export const nested = (): Promise<FromHost> => askHost({ kind: "nested" }, [], []);

/** `simulate(3)` on a world on a worker, its pool three workers this thread lent it. */
export const lent = (): Promise<FromHost> => {
    if (typeof Worker === "function") {
        const lending = lendBrowserWorkers(3);
        return askHost({ kind: "lent", lent: lending.map(each => each.lent) }, lending.flatMap(({ lent }) => [lent.port, lent.owner]), []);
    }
    const lending = lendNodeWorkers(3);
    return askHost({ kind: "lent", lent: lending.map(each => each.lent) }, [], lending.flatMap(({ lent }) => [lent.port, lent.owner]));
};

/** `simulate` on this thread, for comparison. */
export { simulate };
