// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { Observe } from "../../observe/index.js";
import { createWorld, join } from "./create.js";
import { threadLock } from "./joining.js";
import { scopeChannel } from "./port.js";
import { drive, idle, names, total, until, type Driven } from "./joining.test-helper.js";

/** A thread joining a world through the port it's sent and driving it, or holding a world it shares through it. */

/** A system only this thread imports, which a world elsewhere never did. */
const unimportedByMain = System.create({}, () => {});

type Port = MessagePort | NodeMessagePort;
export type ToJoiningWorker =
    | { readonly kind: "join"; readonly port: Port; readonly threads: readonly "main"[] }
    | { readonly kind: "idle"; readonly port: Port; readonly threads: readonly "main"[] }
    /** Join, and add an observer system hearing `total`, as the join resolved. */
    | { readonly kind: "listen"; readonly port: Port; readonly threads: readonly "main"[] }
    /** What the observer system `listen` added heard, once it heard `value`, or after a few seconds. */
    | { readonly kind: "heard"; readonly value: number }
    /** Join, then end this thread on the turn the join resolved, before the world heard it finished. */
    | { readonly kind: "exit on join"; readonly port: Port; readonly threads: readonly "main"[] }
    | { readonly kind: "host"; readonly port: Port }
    /** Hold a world shared through the port, then block this thread for good, so the world never answers a join. */
    | { readonly kind: "host and stall"; readonly port: Port }
    /** Hold a world shared through this worker's own scope, which this fixture's messages share. */
    | { readonly kind: "host scope" }
    /** Once the thread that joined has left: the world's state, and the reports of the runs it drove. */
    | { readonly kind: "state"; readonly driven?: Driven };
export type FromJoiningWorker =
    | { readonly kind: "driven"; readonly driven: Driven }
    | { readonly kind: "joined"; readonly ran: string }
    | { readonly kind: "listening"; readonly joined: string }
    | { readonly kind: "heard"; readonly heard: readonly number[] }
    | { readonly kind: "shared" }
    | { readonly kind: "state"; readonly driven: Driven | null; readonly total: number; readonly names: readonly string[]; readonly status: string | null };

const channel = scopeChannel<FromJoiningWorker, ToJoiningWorker>();
let hosted: ReturnType<typeof createWorld> | null = null;
/** What the observer system `listen` adds heard. */
const heard: number[] = [];
const hear = System.create({ readonly: true }, ({ resources }) => { heard.push(resources[total]); });
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
/** Ends this thread at once: node's worker exits, and a browser worker closes, dropping the tasks it queued. */
const exit = (): void => {
    if (globalThis.process?.versions?.node !== undefined) globalThis.process.exit(0);
    else self.close();
};
channel.onMessage(async message => {
    // The world's own messages, where it shares the scope.
    if ("protocol" in message) return;
    if (message.kind === "host scope") {
        const world = createWorld({ [workers]: 0 });
        const scope = globalThis.process?.getBuiltinModule?.("node:worker_threads")?.parentPort ?? self;
        void world.share(scope);
        hosted = world;
        channel.post({ kind: "shared" });
    }
    else if (message.kind === "join") {
        const remote = await join(message.port, { threads: message.threads });
        channel.post({ kind: "driven", driven: await drive(remote, unimportedByMain) });
        await remote.dispose();
    }
    else if (message.kind === "idle") {
        // Joins and stays, its one run's outcome posted, or why it didn't join.
        const ran = await join(message.port, { threads: message.threads }).then(remote => remote.run(idle)).then(() => "ran", messageOf);
        channel.post({ kind: "joined", ran });
    }
    else if (message.kind === "listen") {
        const joined = await join(message.port, { threads: message.threads }).then(remote => {
            remote.add(hear);
            return "joined";
        }, messageOf);
        channel.post({ kind: "listening", joined });
    }
    else if (message.kind === "heard") {
        const end = performance.now() + 5000;
        while (!heard.includes(message.value) && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
        channel.post({ kind: "heard", heard });
    }
    else if (message.kind === "exit on join") {
        await join(message.port, { threads: message.threads });
        exit();
    }

    else if (message.kind === "host" || message.kind === "host and stall") {
        const world = createWorld({ [workers]: 0 });
        void world.share(message.port);
        hosted = world;
        // Once the world told the port the lock this thread holds while it lives, where it holds one.
        await threadLock();
        channel.post({ kind: "shared" });
        if (message.kind === "host and stall") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    }
    else if (message.kind === "state" && hosted !== null) {
        // Once the thread that joined has left.
        const threads = await until(hosted.threads, shown => shown[0]?.status === "gone");
        channel.post({
            kind: "state",
            driven: message.driven ?? null,
            total: await Observe.toPromise(Observe.resource(hosted, total)),
            names: await Observe.toPromise(Observe.resource(hosted, names)),
            status: threads[0]?.status ?? null,
        });
    }
});
