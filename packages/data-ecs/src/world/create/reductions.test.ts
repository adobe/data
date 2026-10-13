import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Vec3 } from "../../math/index.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";
import { createRegistrar } from "./register.js";
import { createState } from "./state.js";

const position = "reductionsTest/position";
const mass = "reductionsTest/mass";
const heavy = "reductionsTest/heavy";
const total = "reductionsTest/total";
const low = "reductionsTest/low";
const bits = "reductionsTest/bits";
const least = "reductionsTest/least";
const any = "reductionsTest/any";
const level = "reductionsTest/level";
const reads = "reductionsTest/reads";
const wrapped = "reductionsTest/wrapped";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec3;
        [mass]: number;
        [heavy]: true;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [total]: number;
        [low]: Vec3;
        [bits]: number;
        [least]: number;
        [any]: boolean;
        [level]: number;
        [reads]: number;
        [wrapped]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "reductionsTest/spawn": true;
        "reductionsTest/kernel": true;
        "reductionsTest/body": true;
        "reductionsTest/filtered": true;
        "reductionsTest/reader": true;
        "reductionsTest/other": true;
        "reductionsTest/flags": true;
        "reductionsTest/added": true;
        "reductionsTest/infinite": true;
    }
}

Component.register(position, Vec3.schema);
Component.register(mass, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF });
Component.register(heavy, { const: true });
Resource.register(total, { type: "number", default: 0 });
Resource.register(low, { ...Vec3.schema, default: [0, 0, 0] });
Resource.register(bits, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF, default: 0 });
Resource.register(least, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF, default: 0 });
Resource.register(any, { type: "boolean", default: false });
Resource.register(level, { type: "number", default: 0 });
Resource.register(reads, { type: "number", default: 0 });
Resource.register(wrapped, { type: "integer", minimum: -(2 ** 31), maximum: 2 ** 31 - 1, default: 5 });

const rows = 3000;
const positionAt = (i: number): Vec3 => [Math.sin(i) * 100, (i % 97) - 50, i / 7];
const massAt = (i: number): number => (i * 2654435761) >>> 20;

/** Rows in two archetypes, so a run folds more than one call's partials. */
const spawn = System.create({ name: "reductionsTest/spawn" }, (_, __, commands) => {
    for (let i = 0; i < rows; i++) {
        if (i % 3 === 0) commands.spawn({ [position]: positionAt(i), [mass]: massAt(i), [heavy]: true });
        else commands.spawn({ [position]: positionAt(i), [mass]: massAt(i) });
    }
});

const kernel = System.create({ name: "reductionsTest/kernel", kernel: "cpu", query: { read: [position, mass] }, resources: { reduce: { [total]: "+", [low]: "min", [bits]: "|", [least]: "min" } } }, (row, context) => {
    const [x, y, z] = row[position];
    context[total](row[mass]);
    context[total](0.5);
    context[low]([x, y, z]);
    context[bits](row[mass]);
    context[least](row[mass]);
});

/** The same reductions, run as written on the main thread. */
const body = System.create({ name: "reductionsTest/body", query: { read: [position, mass] }, resources: { reduce: { [total]: "+", [low]: "min", [bits]: "|", [least]: "min" } } }, (row, context) => {
    const [x, y, z] = row[position];
    context[total](row[mass]);
    context[total](0.5);
    context[low]([x, y, z]);
    context[bits](row[mass]);
    context[least](row[mass]);
});

const filtered = System.create({ name: "reductionsTest/filtered", kernel: "cpu", query: { read: [mass], has: [heavy] }, resources: { changed: [level], reduce: { [total]: "+", [least]: "min" } } }, (row, context) => {
    context[total](row[mass]);
    context[least](row[mass]);
});

const flags = System.create({ name: "reductionsTest/flags", kernel: "cpu", query: { read: [mass] }, resources: { reduce: { [any]: "|" } } }, (row, context) => {
    context[any](row[mass] > 4000);
});

const expected = () => {
    const masses = Array.from({ length: rows }, (_, i) => massAt(i));
    const positions = Array.from({ length: rows }, (_, i) => positionAt(i));
    return {
        total: masses.reduce((sum, value) => sum + value + 0.5, 0),
        low: [0, 1, 2].map(k => Math.fround(Math.min(...positions.map(p => p[k] ?? NaN)))),
        bits: masses.reduce((or, value) => or | value, 0) >>> 0,
        least: Math.min(...masses),
    };
};

const results = (world: ReturnType<typeof createWorld>) => ({
    total: world.read.resource(total),
    low: world.read.resource(low),
    bits: world.read.resource(bits),
    least: world.read.resource(least),
});

describe("reductions", () => {
    const cases: readonly { readonly label: string; readonly system: typeof kernel | typeof body; readonly wasm: boolean }[] = [
        { label: "JS kernel", system: kernel, wasm: false }, { label: "WASM kernel", system: kernel, wasm: true }, { label: "main-thread body", system: body, wasm: true },
    ];
    for (const { label, system, wasm } of cases) {
        it(`fold every row's contributions into their resources (${label})`, async () => {
            const world = createWorld({ workers: 0, wasm });
            await world.systems.register(spawn, system);
            await world.run(spawn);
            await world.run(system);
            const want = expected();
            const got = results(world);
            // Positions are f32, so their least is too; sums of integers and halves are exact.
            expect({ ...got, low: got.low?.map(Math.fround) }).toEqual(want);
            // A second run replaces the fold rather than adding to it.
            await world.run(system);
            expect(results(world).total).toBe(want.total);
            await world.dispose();
        });
    }

    it("leave their resources alone when a resource filter skips the run, and fold to identity over no rows", async () => {
        const world = createWorld({ workers: 0 });
        await world.systems.register(filtered);
        // No rows yet, and the resource filter passes on the first run: an empty sum, and an empty min of u32s.
        await world.run(filtered);
        expect(world.read.resource(total)).toBe(0);
        expect(world.read.resource(least)).toBe(0xFFFFFFFF);
        await world.systems.register(spawn);
        await world.run(spawn);
        // `level` didn't change, so the run is skipped and the empty fold stays.
        await world.run(filtered);
        expect(world.read.resource(total)).toBe(0);
        await world.dispose();
    });

    it("stamp their resources changed only when the fold differs", async () => {
        let ran = 0;
        const reader = System.create({ name: "reductionsTest/reader", query: { has: [mass] }, resources: { changed: [total] } }, () => { ran++; });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, kernel, reader);
        await world.run(spawn);
        await world.run(kernel);
        await world.run(reader);
        const first = ran;
        expect(first).toBe(rows);
        await world.run(kernel);
        await world.run(reader);
        expect(ran).toBe(first);
        await world.dispose();
    });

    it("store an infinite sum as any write of it, and only an empty min or max as the integer type's extreme", async () => {
        const infinite = System.create({ name: "reductionsTest/infinite", query: { has: [mass] }, resources: { reduce: { [wrapped]: "+" } } }, (_, context) => {
            context[wrapped](Infinity);
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, infinite);
        await world.run(spawn);
        await world.run(infinite);
        expect(world.read.resource(wrapped)).toBe(0);
        await world.dispose();
    });

    it("fold booleans bitwise", async () => {
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, flags);
        await world.run(spawn);
        await world.run(flags);
        expect(world.read.resource(any)).toBe(true);
        await world.dispose();
    });

    it("reject what can't be reduced", async () => {
        const world = createWorld({ workers: 0 });
        const other = System.create({ name: "reductionsTest/other", query: { has: [mass] }, resources: { reduce: { [total]: "max" } } }, () => {});
        await expect(world.systems.register(kernel, other)).rejects.toThrow(`Systems "reductionsTest/kernel" and "reductionsTest/other" both reduce "reductionsTest/total"`);
        // @ts-expect-error booleans reduce bitwise
        const sum = System.create({ name: "reductionsTest/flags", query: { has: [mass] }, resources: { reduce: { [any]: "+" } } }, () => {});
        await expect(createWorld({ workers: 0 }).systems.register(sum)).rejects.toThrow(`booleans reduce with "&", "|" or "^"`);
        // @ts-expect-error a reduction folds every row, so its query has no change filters
        const added = System.create({ name: "reductionsTest/added", query: { read: [mass], added: [mass] }, resources: { reduce: { [total]: "+" } } }, (row, context) => { context[total](row[mass]); });
        await expect(createWorld({ workers: 0 }).systems.register(added)).rejects.toThrow("can't reduce with query change filters");
        // @ts-expect-error a reduced resource can't also be read
        const reading = System.create({ name: "reductionsTest/other", query: { has: [mass] }, resources: { read: [total], reduce: { [total]: "+" } } }, (_, context) => { void context[total]; });
        await expect(createWorld({ workers: 0 }).systems.register(reading)).rejects.toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
        // @ts-expect-error a reduced resource can't also be filtered on
        const filtering = System.create({ name: "reductionsTest/other", query: { has: [mass] }, resources: { changed: [total], reduce: { [total]: "+" } } }, () => {});
        await expect(createWorld({ workers: 0 }).systems.register(filtering)).rejects.toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
        await world.dispose();
    });

    it("leave nothing subscribed to sync points from a registration that failed", () => {
        const state = createState(true);
        const registrar = createRegistrar(state);
        // @ts-expect-error booleans reduce bitwise
        const sum = System.create({ name: "reductionsTest/flags", query: { has: [mass] }, resources: { reduce: { [any]: "+" } } }, () => {});
        expect(() => registrar.register([kernel, sum])).toThrow(`booleans reduce with "&", "|" or "^"`);
        expect(state.afterSync.size).toBe(0);
        registrar.register([kernel]).rollback();
        expect(state.afterSync.size).toBe(0);
    });
});
