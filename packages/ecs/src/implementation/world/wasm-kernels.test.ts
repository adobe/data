// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { definitionOf } from "../../interface/registry/index.js";
import { kernelOf } from "./attach-kernel.js";
import { readEach, readEntity, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { bindKernel } from "./kernels.js";
import { createState } from "./state.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32, I32 } from "../../interface/math/index.js";

type Vec2 = readonly [number, number];
const vec2 = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } as const satisfies Schema;

const position = Symbol("wasmTest/position");
const velocity = Symbol("wasmTest/velocity");
const bounces = Symbol("wasmTest/bounces");
const flipped = Symbol("wasmTest/flipped");
const score = Symbol("wasmTest/score");
const seconds = Symbol("wasmTest/seconds");
const floor = Symbol("wasmTest/floor");
const target = Symbol("wasmTest/target");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 2; maxItems: 2; layout: "storage" }> };
        [velocity]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 2; maxItems: 2 }> };
        [bounces]: { type: I32 };
        [flipped]: { type: boolean };
        [score]: { type: number };
        [target]: { type: Entity };
    }
    export interface Resources {
        [seconds]: { type: number; default: typeof secondsStart };
        [floor]: { type: F32; default: -2.5 };
    }
}

const secondsStart = 1 / 60;

const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    let previous = Entity.none;
    for (let i = 0; i < input.count; i++) {
        previous = commands.spawn([position, velocity, bounces, flipped, score, target])({ [position]: [i * 0.37, (i % 13) * 0.71], [velocity]: [Math.sin(i) * 3, Math.cos(i) * 5], [bounces]: 0, [flipped]: false, [score]: 0, [target]: previous });
    }
});

/** Despawns every seventh entity and spawns replacements, so some targets go stale and their indexes are reused. */
const cull = System.create({ components: { read: [position], has: [bounces] } }, (row, { commands }, input: { readonly frame: number }) => {
    if ((row.entity >>> 0) % 7 !== input.frame % 7) return;
    commands.despawn(row.entity);
    commands.spawn([position, velocity, bounces, flipped, score, target])({ [position]: row[position], [velocity]: [1, 1], [bounces]: 0, [flipped]: true, [score]: 0, [target]: row.entity });
});

const halve = (value: number) => value * 0.5;

const integrate = System.create({
    kernel: "cpu",
    components: { write: [position, velocity] },
    resources: { read: [seconds] },
}, (row, { resources }) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    const t = resources[seconds];
    row[velocity] = [vx * 0.999, vy - 9.8 * t];
    row[position] = [x + vx * t, y + halve(vy) * t * 2];
});

const bounce = System.create({
    kernel: "cpu",
    components: { write: [position, velocity, bounces, flipped] },
    resources: { read: [floor] },
    after: [integrate],
}, (row, { resources }) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    if (y < resources[floor] && vy < 0) {
        row[position] = [x, resources[floor] + Math.abs(y - resources[floor])];
        row[velocity] = [vx, Math.min(-vy * 0.8, 40)];
        row[bounces] = row[bounces] + 1;
        row[flipped] = !row[flipped];
    }
    else if (x % 7 > 6.5) {
        row[flipped] = row[flipped] === true ? false : true;
    }
});

const tally = System.create({
    kernel: "cpu",
    components: { read: [bounces, flipped, position], write: [score] },
    after: [bounce],
}, row => {
    let total = 0;
    for (let i = 0; i < 10; i++) {
        if (i === 7) break;
        if (i % 2 === 1) continue;
        total += i * row[bounces];
    }
    const [x] = row[position];
    row[score] = total + (row[flipped] ? Math.floor(x * 100) / 100 : Math.round(x) | 0) + (x > 3 && x < 9 ? 1 : 0);
});

const scale = System.create({
    kernel: "cpu",
    components: { write: [score] },
}, (row, _context, input: { readonly factor: number }) => {
    row[score] = row[score] * input.factor;
});

/** Component-wise vector math: one f32x4 operation per row. */
const drift = System.create({
    kernel: "cpu",
    components: { read: [velocity], write: [position] },
    resources: { read: [seconds] },
    after: [tally],
}, (row, { resources }) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    const t = resources[seconds];
    row[position] = [x + vx * t, y + vy * t];
});

/** Runs only for rows whose bounces changed since it last ran. */
const react = System.create({
    kernel: "cpu",
    components: { write: [score], changed: [bounces] },
    after: [tally],
}, row => {
    row[score] = row[score] + 1000;
});

/** A lookup per row: found targets pull, missing or stale ones cost a point. */
const chase = System.create({
    kernel: "cpu",
    components: { read: [target], write: [score] },
    lookup: { targets: { read: [position, flipped] } },
    after: [react, drift],
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    if (other === null) {
        row[score] = row[score] - 1;
        return;
    }
    const [x, y] = other[position];
    row[score] = row[score] + (other[flipped] ? x : y);
});

const main = System.create({ systems: [integrate, bounce, tally, drift, react, chase] });

const snapshotted = [position, velocity, bounces, flipped, score] as const;

/** Each entity's values in `snapshotted` order, as arrays, since JSON leaves out symbol keys. */
const snapshot = async (world: World): Promise<unknown[]> =>
    Promise.all((await select(world, { required: [position] })).map(async entity => {
        const values = await readEntity(world, entity, snapshotted);
        return snapshotted.map(key => values?.[key]);
    }));


const simulate = async (wasm: boolean, simd = false): Promise<unknown[]> => {
    const world = createWorld({ [workers]: 0 }, { wasm, simd });
    await world.run(seed, { count: 300 });
    for (let frame = 0; frame < 120; frame++) {
        await world.run(main);
        if (frame % 30 === 0) await world.run(scale, { factor: 1.5 });
        if (frame % 20 === 10) await world.run(cull, { frame });
    }
    const result = await snapshot(world);
    await world.dispose();
    return result;
};

/** Counts the runs of rows whose score changed. */
const recount = System.create({ kernel: "cpu", components: { write: [bounces], changed: [score] } }, row => {
    row[bounces] += 1;
});
const chosen = new Set<Entity>();
const rescore = System.create({ components: { write: [score] } }, row => {
    if (chosen.has(row.entity)) row[score] += 1;
});

/** Keeps ticks of `score` without observing its changes, so kernels writing it mute their stamps. */
const scoreAdded = System.create({ components: { added: [score] } }, () => {});
const raise = System.create({ kernel: "cpu", components: { write: [score] } }, row => {
    row[score] += 1;
});
let raised = 0;
const countRaised = System.create({ components: { changed: [score] } }, () => { raised++; });

describe("WASM kernels", () => {
    it("stamp what they write once a change filter observes a component that already kept ticks", async () => {
        for (const simd of [true, false]) {
            await using ecs = createWorld({ [workers]: 0 }, { simd });
            await ecs.run(seed, { count: 100 });
            await ecs.run(scoreAdded);
            await ecs.run(raise);
            raised = 0;
            // Observing `score` loads `raise` again with its stamps, while `score`'s columns stay where they were.
            await ecs.run(countRaised);
            await ecs.run(raise);
            await ecs.run(countRaised);
            expect(raised, `simd ${simd}`).toBe(200);
        }
    });

    it("pass exactly the rows a change filter passes, across blocks of rows and their edges", async () => {
        const rows = [0, 3, 7, 8, 15, 16, 40, 41, 42, 43, 44, 45, 46, 47, 63, 64, 98, 99];
        for (const [wasm, simd] of [[true, true], [true, false], [false, false]] as const) {
            await using ecs = createWorld({ [workers]: 0 }, { wasm, simd });
            await ecs.run(seed, { count: 100 });
            await ecs.run(recount);
            const entities = await select(ecs, { required: [score] });
            chosen.clear();
            for (const row of rows) chosen.add(entities[row]);
            await ecs.run(rescore);
            await ecs.run(recount);
            const ran = (await readEach(ecs, entities, bounces)).flatMap((value, row) => value === 2 ? [row] : []);
            expect(ran, `wasm ${wasm}, simd ${simd}`).toEqual(rows);
        }
    });


    it("are generated for every kernel here, with SIMD only where lanes line up", () => {
        const wasmOf = (system: typeof integrate | typeof bounce | typeof tally | typeof scale | typeof drift | typeof chase) => {
            const definition = definitionOf(system);
            if (definition === undefined || definition.kind === "composite") throw new Error("not a leaf");
            const description = kernelOf(system);
            if (description === undefined) throw new Error("not compiled");
            return bindKernel(createState(), definition, description).wasm;
        };
        expect([integrate, bounce, tally, scale, drift].map(system => wasmOf(system)?.vectorized)).toEqual([false, false, false, false, true]);
        expect(wasmOf(chase)).not.toBeNull();
    });

    it("give bit-identical results to the JS kernels without SIMD", async () => {
        const javascript = await simulate(false);
        expect(javascript.some(values => JSON.stringify(values).includes("true"))).toBe(true);
        expect(await simulate(true)).toEqual(javascript);
    });

    it("stay within storage precision of the JS kernels with SIMD", async () => {
        const javascript = await simulate(false);
        const vector = await simulate(true, true);
        expect(vector).toHaveLength(javascript.length);
        const leaves = (value: unknown): number[] => JSON.stringify(value).match(/-?[\d.]+(?:e[-+]?\d+)?/g)?.map(Number) ?? [];
        const relative = leaves(vector).map((value, i) => Math.abs(value - leaves(javascript)[i]) / Math.max(1, Math.abs(leaves(javascript)[i])));
        expect(Math.max(...relative)).toBeLessThan(1e-4);
        expect(vector).not.toEqual(javascript);
    });
});
