// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { clock } from "../../interface/resources/clock.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type CreatedWorld } from "./create.js";
import type { FromRemovalWorker, ToRemovalWorker } from "./removal-worker.fixture.js";
import { first, second, secondRuns, setPause, ticking } from "./remove.test-helper.js";

/** Scenarios of removing systems placed on a joined worker, run built in node and from source in chromium. */

type Worker = { readonly ask: (message: ToRemovalWorker, transfer: readonly unknown[]) => Promise<FromRemovalWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./removal-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./removal-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromRemovalWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer) => new Promise(resolve => {
            const reply = (data: FromRemovalWorker): void => {
                if ("protocol" in data) return;
                worker.off("message", reply);
                resolve(data);
            };
            worker.on("message", reply);
            worker.postMessage(message, transfer.filter(port => port instanceof threads.MessagePort));
        }),
        terminate: async () => { await worker.terminate(); },
    };
};

const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const later = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Removes `second` from the world's thread while the joined worker runs `first`, whose task holds `second` too:
 * `second`'s runs when `remove` returned and once ticks went on, and the indexes the world holds on the worker before
 * removing, after, and once `first` is removed too.
 */
export const removedMidTask = async () => {
    const world: CreatedWorld = createWorld({ [workers]: 0, [always]: true });
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    await until(world.threads, threads => threads.at(-1)?.status === "joined");
    try {
        world.add(first);
        world.add(second);
        world.add(ticking);
        await until(Observe.resource(world, secondRuns), runs => runs >= 2);
        const placed = (await world.tables()).joined;
        // `first` spins for 200 ms in each task from the next tick on; 50 ms into the first of them, `second` is removed.
        await world.run(setPause, { milliseconds: 200 });
        const removed = new Promise<number>(resolve => setTimeout(() => {
            world.remove(second);
            resolve(Observe.toPromise(Observe.resource(world, secondRuns)));
        }, 50));
        const atRemove = await removed;
        await world.run(setPause, { milliseconds: 0 });
        const tick = (await Observe.toPromise(Observe.resource(world, clock))).tick;
        await until(Observe.resource(world, clock), value => value.tick >= tick + 10);
        const after = await Observe.toPromise(Observe.resource(world, secondRuns));
        let left = (await world.tables()).joined;
        for (let k = 0; k < 100 && left[0] !== 1; k++) left = (await later(10), await world.tables()).joined;
        world.remove(first);
        let none = (await world.tables()).joined;
        for (let k = 0; k < 100 && none[0] !== 0; k++) none = (await later(10), await world.tables()).joined;
        return { atRemove, after, placed, left, none };
    }
    finally {
        await worker.terminate();
        await world.dispose();
    }
};
