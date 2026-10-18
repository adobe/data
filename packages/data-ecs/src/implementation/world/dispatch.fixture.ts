import { Component } from "../../interface/component/component.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";

/** Scenarios of dispatching tasks to workers, run built in node and from source in chromium. */

type Vec2 = readonly [number, number];
const vec2 = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } as const satisfies Schema;
const position = Symbol("dispatchTest/position");
const velocity = Symbol("dispatchTest/velocity");
const offset = Symbol("dispatchTest/offset");
const tagA = Symbol("dispatchTest/a");
const tagB = Symbol("dispatchTest/b");
const tagC = Symbol("dispatchTest/c");
const tagD = Symbol("dispatchTest/d");
const tagE = Symbol("dispatchTest/e");
const tagF = Symbol("dispatchTest/f");
const tagG = Symbol("dispatchTest/g");
const tags = [tagA, tagB, tagC, tagD, tagE, tagF, tagG] as const;
declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
        [offset]: typeof offsetTraits;
        [tagA]: typeof tagATraits; [tagB]: typeof tagBTraits; [tagC]: typeof tagCTraits; [tagD]: typeof tagDTraits;
        [tagE]: typeof tagETraits; [tagF]: typeof tagFTraits; [tagG]: typeof tagGTraits;
    }
}
const positionTraits = Component.register(position, { type: vec2 });
const velocityTraits = Component.register(velocity, { type: vec2 });
const offsetTraits = Component.register(offset, { type: { type: "number", precision: 1 } });
const tagATraits = Component.register(tagA, { type: { const: true } });
const tagBTraits = Component.register(tagB, { type: { const: true } });
const tagCTraits = Component.register(tagC, { type: { const: true } });
const tagDTraits = Component.register(tagD, { type: { const: true } });
const tagETraits = Component.register(tagE, { type: { const: true } });
const tagFTraits = Component.register(tagF, { type: { const: true } });
const tagGTraits = Component.register(tagG, { type: { const: true } });

const scatter = System.create({ name: "dispatchTest/scatter" }, ({ commands }) => {
    for (let i = 0; i < 128 * 64; i++) {
        const components: (typeof position | typeof velocity | typeof offset | (typeof tags)[number])[] = [position, velocity, offset];
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) components.push(tag); });
        commands.spawn(components)({ [position]: [i, 0], [velocity]: [1, i % 5], [offset]: 0 });
    }
});
const seed = System.create({ name: "dispatchTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn([position, velocity, offset])({ [position]: [i, 0], [velocity]: [1, i % 5], [offset]: 0 });
});
const fastA = System.create({ name: "dispatchTest/fastA", kernel: "cpu", components: { read: [velocity], write: [position] } }, row => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    row[position] = [x + vx, y + vy];
});
// Commands make it a JS kernel, dispatched by message.
const slowB = System.create({ name: "dispatchTest/slowB", kernel: "cpu", components: { read: [velocity] } }, (row, { commands }) => {
    const [vx] = row[velocity];
    if (vx > 100) commands.despawn(row.entity);
});
const fastC = System.create({ name: "dispatchTest/fastC", kernel: "cpu", components: { read: [velocity], write: [offset] } }, row => {
    const [vx, vy] = row[velocity];
    row[offset] = vx + vy;
});

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> =>
    Promise.race([promise, new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), ms))]);

const grow = System.create({ name: "dispatchTest/seed/2" }, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn([position, velocity, offset])({ [position]: [i, 1], [velocity]: [2, i % 3], [offset]: 0 });
});
let observedRows = 0;
const bump = System.create({ name: "dispatchTest/fastA/2", kernel: "cpu", components: { write: [offset] } }, row => {
    row[offset] = row[offset] + 1;
});
const watch = System.create({ name: "dispatchTest/slowB/2", components: { changed: [offset] } }, () => { observedRows++; });
const later = System.create({ name: "dispatchTest/fastC/2", kernel: "cpu", components: { read: [velocity], write: [offset] }, after: [watch] }, row => {
    const [vx, vy] = row[velocity];
    row[offset] = vx + vy;
});
/** Runs `use` with a world, then disposes it. */
const using = async <T>(world: World, use: (world: World) => Promise<T>): Promise<T> => {
    try {
        return await use(world);
    }
    finally {
        await world.dispose();
    }
};

/** Rows an observer registered after a kernel saw change once that kernel ran again. */
export const reloadedOnObserver = (): Promise<number> => using(createWorld({ [workers]: 2 }, { minimumChunk: 64 }), async world => {
    await world.run(seed);
    await world.run(bump);
    await world.run(watch);
    observedRows = 0;
    await world.run(bump);
    await world.run(watch);
    return observedRows;
});

/** After a registration whose WASM failed to compile: what it rejected with, and the rows the observer then saw change. */
export const afterFailedRegistration = (failing = 2): Promise<{ readonly rejected: string; readonly rows: number }> => using(createWorld({ [workers]: 2 }, { minimumChunk: 64 }), async world => {
    await world.run(seed);
    await world.run(bump);
    const original = WebAssembly.compile;
    let calls = 0;
    WebAssembly.compile = (bytes: BufferSource) => (++calls === failing ? Promise.reject(new Error("injected")) : original(bytes));
    let rejected = "resolved";
    try {
        await world.run(System.create({ name: "dispatchTest/tier/2", systems: [watch, later] }));
    }
    catch (error) {
        rejected = String(error);
    }
    finally {
        WebAssembly.compile = original;
    }
    await world.run(watch);
    observedRows = 0;
    await world.run(bump);
    await world.run(watch);
    return { rejected, rows: observedRows };
});

/** Positions after 12 frames of growth then a kernel, back to back, or "timeout". */
const backToBackRun = (count: number, wasm = true, delay = false): Promise<readonly string[] | "timeout"> => using(createWorld({ [workers]: count }, { minimumChunk: 64, wasm }), async world => {
    for (let frame = 0; frame < 12; frame++) {
        const r = await withTimeout((async () => { await world.run(grow); if (delay) await new Promise(r => setTimeout(r, 30)); await world.run(fastA); })(), 20000);
        if (r === "timeout") return "timeout";
    }
    return (await readEach(world, await select(world, { required: [position] }), position)).map(each => JSON.stringify(each)).sort();
});

/** Positions that differ from the main thread alone's, or "timeout", for workers with JS and WASM kernels, with and without a delay. */
export const backToBack = async (): Promise<readonly (number | "timeout")[]> => {
    const alone = await backToBackRun(0);
    const diff = (a: readonly string[] | "timeout", b: readonly string[] | "timeout"): number | "timeout" =>
        a === "timeout" || b === "timeout" ? "timeout" : a.filter((v, i) => v !== b[i]).length;
    const results = [diff(await backToBackRun(3, false), alone), diff(await backToBackRun(0, true), alone)];
    for (let i = 0; i < 2; i++) results.push(diff(await backToBackRun(3), alone));
    for (let i = 0; i < 2; i++) results.push(diff(await backToBackRun(3, true, true), alone));
    return results;
};

/** Tiers dispatched together: fast tasks through rings and message tasks, by the names of their systems. */
export const tierSystems = {
    "fastA,slowB": [fastA, slowB],
    "fastA,fastC": [fastA, fastC],
    "slowB,fastC": [slowB, fastC],
    "fastA,slowB,fastC": [fastA, slowB, fastC],
} as const;

let tiers = 0;

/** A tier of `systems` run `frames` times on `count` workers after `prepare`: "ok", or "timeout" if a run hung. */
const runTier = (systems: readonly System[], count: number, frames: number, prepare: System): Promise<"ok" | "timeout"> => using(createWorld({ [workers]: count }, { minimumChunk: 64 }), async world => {
    const tier = System.create({ name: `dispatchTest/tier/${3 + tiers++}`, systems: [...systems] });
    await world.run(prepare);
    let result: unknown = "ok";
    for (let frame = 0; frame < frames && result !== "timeout"; frame++) result = await withTimeout(world.run(tier), 3000);
    return result === "timeout" ? "timeout" : "ok";
});

/** 50 frames of a tier on two workers. */
export const tier = (name: keyof typeof tierSystems): Promise<"ok" | "timeout"> => runTier(tierSystems[name], 2, 50, seed);

/** Five frames of a fast task and a message task in one tier, after one worker's ring overflowed. */
export const overflowThenMessage = (): Promise<"ok" | "timeout"> => runTier([fastA, slowB], 1, 5, scatter);
