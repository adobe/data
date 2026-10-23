// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { indexOf } from "./entities.js";
import type { FromRemoteFinalizersWorker, ToRemoteFinalizersWorker } from "./remote-finalizers-worker.fixture.js";
import { despawn, regauge, rehead, released, retitle, scenario, serial, sorted, spawn, spawnHeaded, spawnTitled, type Released } from "./remote-finalizers.test-helper.js";
import { fillReports, runReported } from "./reports.test-helper.js";

/**
 * Scenarios of finalizers on a joined worker, run built in node and from source in chromium: the same stops as an
 * inline world's, and a worker that never yields holding the indexes of entities it hasn't finalized until it's ended.
 */

type Worker = { readonly ask: (message: ToRemoteFinalizersWorker, transfer?: readonly unknown[]) => Promise<FromRemoteFinalizersWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./remote-finalizers-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./remote-finalizers-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromRemoteFinalizersWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromRemoteFinalizersWorker): void => {
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

/** The first value an observer gives that `accept` takes. */
const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

/** A world shared with a worker that joins it claiming "remoteFinalizersTest", once it joined. */
const joined = async (world: CreatedWorld): Promise<{ readonly worker: Worker }> => {
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    await until(world.threads, threads => threads.at(-1)?.status === "joined");
    return { worker };
};

/** Holds the worker, which runs nothing until the returned function lets it go on. */
const hold = async (worker: Worker): Promise<() => void> => {
    const flag = new Int32Array(new SharedArrayBuffer(4));
    await worker.ask({ kind: "hold", flag });
    return () => {
        Atomics.store(flag, 0, 1);
        Atomics.notify(flag, 0);
    };
};

/** What the worker's finalizer saw. */
const releasedThere = async (worker: Worker): Promise<readonly Released[]> => {
    const reply = await worker.ask({ kind: "released" });
    return reply.kind === "released" ? reply.released : [];
};

/** The scenario's stops, inline and with the joined worker running the finalizer, in order by serial. */
export const sameStops = async () => {
    released.length = 0;
    const inline = createWorld({ [workers]: 0 });
    const counts = await scenario(inline, () => released.length);
    const expected = sorted(released);
    await inline.dispose();
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    const seen = await scenario(world, async () => (await releasedThere(worker)).length, counts);
    const actual = sorted(await releasedThere(worker));
    await worker.terminate();
    await world.dispose();
    return { expected: { counts, stops: expected }, actual: { counts: seen, stops: actual } };
};

/**
 * A worker that never yields, so it acknowledges no stop: the indexes of the entities despawned stay held while it
 * lives, and once it's ended they're reused, the stops it never finalized reported.
 */
export const diesHolding = async () => {
    const world = createWorld({ [workers]: 0 });
    // Past the runs that spawn reports, whose entities would take the released indexes first.
    await fillReports(world);
    const { worker } = await joined(world);
    await world.run(spawn, { from: 0, count: 4 });
    const stopped: Entity[] = [];
    for (const value of [0, 1, 2]) stopped.push(...await Observe.toPromise(Observe.select(world, { required: [serial], where: { [serial]: value } })));
    const despawned = new Set(stopped.map(indexOf));
    /** Live entities at the indexes of those despawned. */
    const reused = async (): Promise<number> => (await Observe.toPromise(Observe.select(world, { required: [serial] }))).filter(entity => despawned.has(indexOf(entity))).length;
    await worker.ask({ kind: "spin" });
    await world.run(despawn, { serials: [0, 1, 2] });
    // Spawns while it lives take other indexes.
    await world.run(spawn, { from: 10, count: 6 });
    const whileHeld = await reused();
    await worker.terminate();
    await until(world.threads, threads => threads.at(-1)?.status === "gone");
    const report = await runReported(world, spawn, { from: 20, count: 0 });
    await world.run(spawn, { from: 30, count: 6 });
    const after = await reused();
    await world.dispose();
    return { held: despawned.size, whileHeld, failures: report.failures.map(failure => [failure.kind, failure.name, failure.message]), after };
};

/**
 * Titled rows despawned while the worker is held, then the world's thread rewriting the titles of others six
 * times, so the records the despawned rows' titles were in are freed and reused before the worker finalizes them:
 * the titles its finalizer read.
 */
export const titledStops = async () => {
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    await world.run(spawnTitled, { from: 0, count: 50 });
    const release = await hold(worker);
    await world.run(despawn, { serials: Array.from({ length: 50 }, (_, k) => k) });
    await world.run(spawnTitled, { from: 100, count: 50 });
    for (let round = 0; round < 6; round++) await world.run(retitle, { round });
    release();
    let seen: readonly { readonly serial: number; readonly title: string }[] = [];
    for (let k = 0; k < 200 && seen.length < 50; k++) {
        const reply = await worker.ask({ kind: "entitled" });
        seen = reply.kind === "entitled" ? reply.entitled : [];
    }
    await worker.terminate();
    await world.dispose();
    return [...seen].sort((a, b) => a.serial - b.serial);
};

/**
 * Headed rows despawned with the heading "h0" while the worker is held, then the world's thread writing the heading
 * and subheading six times, so the records of "h0" and "sh0" are freed and reused before the worker finalizes them,
 * and the rest despawned once it goes on: what its finalizers of one and two string resources read.
 */
export const headedStops = async () => {
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    await world.run(rehead, { heading: "h0" });
    await world.run(spawnHeaded, { from: 0, count: 20 });
    const release = await hold(worker);
    await world.run(despawn, { serials: Array.from({ length: 10 }, (_, k) => k) });
    for (let round = 1; round <= 6; round++) await world.run(rehead, { heading: `h${round}` });
    release();
    await world.run(despawn, { serials: Array.from({ length: 10 }, (_, k) => 10 + k) });
    let seen: readonly { readonly serial: number; readonly heading: string }[] = [];
    let both: readonly { readonly serial: number; readonly heading: string; readonly subheading: string }[] = [];
    for (let k = 0; k < 200 && (seen.length < 20 || both.length < 20); k++) {
        const reply = await worker.ask({ kind: "headlined" });
        seen = reply.kind === "headlined" ? reply.headlined : [];
        both = reply.kind === "headlined" ? reply.both : [];
    }
    await worker.terminate();
    await world.dispose();
    return { one: [...seen].sort((a, b) => a.serial - b.serial), two: [...both].sort((a, b) => a.serial - b.serial) };
};

/**
 * Headed rows despawned at level 0 while the worker is held, then the world's thread writing the level and origin six
 * times, and the rest despawned once it goes on: the linear resources its finalizer read.
 */
export const gaugedStops = async () => {
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    await world.run(regauge, { level: 0 });
    await world.run(spawnHeaded, { from: 0, count: 20 });
    const release = await hold(worker);
    await world.run(despawn, { serials: Array.from({ length: 10 }, (_, k) => k) });
    for (let round = 1; round <= 6; round++) await world.run(regauge, { level: round });
    release();
    await world.run(despawn, { serials: Array.from({ length: 10 }, (_, k) => 10 + k) });
    let seen: readonly { readonly serial: number; readonly level: number; readonly origin: readonly number[] }[] = [];
    for (let k = 0; k < 200 && seen.length < 20; k++) {
        const reply = await worker.ask({ kind: "gauged" });
        seen = reply.kind === "gauged" ? reply.gauged : [];
    }
    await worker.terminate();
    await world.dispose();
    return [...seen].sort((a, b) => a.serial - b.serial);
};
