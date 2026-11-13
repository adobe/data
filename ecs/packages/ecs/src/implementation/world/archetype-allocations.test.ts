// © 2026 Adobe. MIT License. See /LICENSE for details.
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { archetypeOf, createState, idOf, withComponents } from "./state.js";

const big = Symbol("archetypeAllocationsTest/big");
const first = Symbol("archetypeAllocationsTest/first");
const b = Symbol("archetypeAllocationsTest/b");
const c = Symbol("archetypeAllocationsTest/c");
const d = Symbol("archetypeAllocationsTest/d");
const e = Symbol("archetypeAllocationsTest/e");
const f = Symbol("archetypeAllocationsTest/f");
const g = Symbol("archetypeAllocationsTest/g");
const h = Symbol("archetypeAllocationsTest/h");
const i = Symbol("archetypeAllocationsTest/i");
const j = Symbol("archetypeAllocationsTest/j");
const k = Symbol("archetypeAllocationsTest/k");
const l = Symbol("archetypeAllocationsTest/l");
const m = Symbol("archetypeAllocationsTest/m");
const n = Symbol("archetypeAllocationsTest/n");
const o = Symbol("archetypeAllocationsTest/o");
const p = Symbol("archetypeAllocationsTest/p");
const q = Symbol("archetypeAllocationsTest/q");
const r = Symbol("archetypeAllocationsTest/r");
const s = Symbol("archetypeAllocationsTest/s");
const t = Symbol("archetypeAllocationsTest/t");
const u = Symbol("archetypeAllocationsTest/u");
const v = Symbol("archetypeAllocationsTest/v");
const w = Symbol("archetypeAllocationsTest/w");
const x = Symbol("archetypeAllocationsTest/x");
const alpha = Symbol("archetypeAllocationsTest/alpha");
const beta = Symbol("archetypeAllocationsTest/beta");
const gamma = Symbol("archetypeAllocationsTest/gamma");
const delta = Symbol("archetypeAllocationsTest/delta");

declare module "@adobe/ecs" {
    interface Resources {
        [big]: { type: Uint8Array; length: 16777216 };
        [first]: { type: number; default: 0 };
        [b]: { type: number; default: 0 };
        [c]: { type: number; default: 0 };
        [d]: { type: number; default: 0 };
        [e]: { type: number; default: 0 };
        [f]: { type: number; default: 0 };
        [g]: { type: number; default: 0 };
        [h]: { type: number; default: 0 };
        [i]: { type: number; default: 0 };
        [j]: { type: number; default: 0 };
        [k]: { type: number; default: 0 };
        [l]: { type: number; default: 0 };
        [m]: { type: number; default: 0 };
        [n]: { type: number; default: 0 };
        [o]: { type: number; default: 0 };
        [p]: { type: number; default: 0 };
        [q]: { type: number; default: 0 };
        [r]: { type: number; default: 0 };
        [s]: { type: number; default: 0 };
        [t]: { type: number; default: 0 };
        [u]: { type: number; default: 0 };
        [v]: { type: number; default: 0 };
        [w]: { type: number; default: 0 };
        [x]: { type: number; default: 0 };
    }
    interface Components {
        [alpha]: { type: number };
        [beta]: { type: number };
        [gamma]: { type: number };
        [delta]: { type: true };
    }
}

const bigBytes = 2 ** 24;
/** The world's start of the big resource, its zeros, and its one column. */
const startAndColumn = 2 * bigBytes;

/** A page that isn't cross-origin isolated: no shared memory, so each column is an `ArrayBuffer` of its own. */
const isolated = Object.getOwnPropertyDescriptor(globalThis, "crossOriginIsolated");
const notIsolated = (): void => { Object.defineProperty(globalThis, "crossOriginIsolated", { value: false, configurable: true }); };
afterEach(() => {
    if (isolated === undefined) Reflect.deleteProperty(globalThis, "crossOriginIsolated");
    else Object.defineProperty(globalThis, "crossOriginIsolated", isolated);
});

const readFirst = System.create({ readonly: true }, ({ resources }) => resources[first]);
const readSeven = System.create({ readonly: true }, ({ resources }) =>
    resources[big].length + resources[b] + resources[c] + resources[d] + resources[e] + resources[f] + resources[g]);
const readTwentyFour = System.create({ readonly: true }, ({ resources }) => resources[big].length + resources[b] + resources[c] + resources[d] + resources[e]
    + resources[f] + resources[g] + resources[h] + resources[i] + resources[j] + resources[k] + resources[l] + resources[m] + resources[n] + resources[o]
    + resources[p] + resources[q] + resources[r] + resources[s] + resources[t] + resources[u] + resources[v] + resources[w] + resources[x]);
const spawnOne = System.create({}, ({ commands }) => { commands.spawn([alpha])({ [alpha]: 0 }); });
const readBig = System.create({ readonly: true }, ({ resources }) => resources[big].length);
const readB = System.create({ readonly: true }, ({ resources }) => resources[b]);
const readC = System.create({ readonly: true }, ({ resources }) => resources[c]);
const readD = System.create({ readonly: true }, ({ resources }) => resources[d]);

setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc");

/** `ArrayBuffer` bytes `step` holds on to, garbage collected before and after. */
const bytesAdded = async (step: () => Promise<unknown>): Promise<number> => {
    collect();
    const before = process.memoryUsage().arrayBuffers;
    await step();
    collect();
    return process.memoryUsage().arrayBuffers - before;
};

describe("adding resources", () => {
    it("allocates a 16 MiB resource's column once for 7 added in one command", async () => {
        notIsolated();
        await using world = createWorld({ [workers]: 0 });
        await world.run(readFirst);
        const { archetypes } = await world.tables();
        const added = await bytesAdded(() => world.run(readSeven));
        expect(added).toBeLessThan(startAndColumn + bigBytes / 2);
        // The resource entity's new archetype alone.
        expect((await world.tables()).archetypes).toBe(archetypes + 1);
    });

    it("allocates it once for 24 added in one command", async () => {
        notIsolated();
        await using world = createWorld({ [workers]: 0 });
        await world.run(readFirst);
        const added = await bytesAdded(() => world.run(readTwentyFour));
        expect(added).toBeLessThan(startAndColumn + bigBytes / 2);
    });

    it("releases the arrays of the archetype the resource entity left", async () => {
        notIsolated();
        await using world = createWorld({ [workers]: 0 });
        await world.run(readBig);
        const added = await bytesAdded(async () => {
            await world.run(readB);
            await world.run(readC);
            await world.run(readD);
            // Sync points enough that no reader can still read what it left.
            for (let k = 0; k < 12; k++) await world.run(spawnOne);
        });
        // The column of the archetype it's in, made as it arrived, and nothing of those it left.
        expect(added).toBeLessThan(bigBytes * 1.5);
    });
});

describe("adding several components at once", () => {
    it("makes no archetype between the entity's and its target", async () => {
        await using world = createWorld({ [workers]: 0 });
        let entity = -1 as Entity;
        await world.run(System.create({}, ({ commands }) => { entity = commands.spawn([alpha])({ [alpha]: 1 }); }));
        const { archetypes } = await world.tables();
        await world.run(System.create({}, ({ commands }) => { commands.add(entity, [beta, gamma, delta], { [beta]: 2, [gamma]: 3 }); }));
        expect((await world.tables()).archetypes).toBe(archetypes + 1);
    });

    it("finds the same target again through cached edges, making nothing", () => {
        const state = createState(false);
        const ids = Int32Array.of(idOf(state, beta), idOf(state, gamma), idOf(state, delta));
        const source = archetypeOf(state, [idOf(state, alpha)]);
        const target = withComponents(state, source, ids, 0, ids.length);
        const made = state.archetypes.length;
        expect(target.components.length).toBe(4);
        expect(source.jumps).toEqual([target]);
        expect(withComponents(state, source, ids, 0, ids.length)).toBe(target);
        expect(withComponents(state, source, Int32Array.of(ids[2], ids[0], ids[1], ids[0]), 0, 4)).toBe(target);
        expect(state.archetypes.length).toBe(made);
        expect(source.jumps.length).toBe(1);
        // An archetype made only to pass through holds no rows, and no memory.
        expect(target.capacity).toBe(0);
    });
});
