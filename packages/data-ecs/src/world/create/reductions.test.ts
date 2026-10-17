import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Vec3 } from "../../math/index.js";
import { Resource } from "../../resource/resource.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";
import { definitionOf } from "../../system/definition.js";
import type { Name } from "../../system/name.js";
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
const seen = "reductionsTest/seen";
const wrapped = "reductionsTest/wrapped";
const summed = "reductionsTest/summed";

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [mass]: { type: number };
        [heavy]: { type: true };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [low]: { type: Vec3; reduce: "min" };
        [bits]: { type: number; reduce: "|" };
        [least]: { type: number; reduce: "min" };
        [any]: { type: boolean; reduce: "|" };
        [level]: { type: number };
        [seen]: { type: number };
        [wrapped]: { type: number; reduce: "+" };
        [summed]: { type: boolean; reduce: "|" };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(mass, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
Component.register(heavy, { type: { const: true } });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(low, { type: { ...Vec3.schema, default: [0, 0, 0] }, reduce: "min" });
Resource.register(bits, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF, default: 0 }, reduce: "|" });
Resource.register(least, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF, default: 0 }, reduce: "min" });
Resource.register(any, { type: { type: "boolean", default: false }, reduce: "|" });
Resource.register(level, { type: { type: "number", default: 0 } });
Resource.register(seen, { type: { type: "number", default: 0 } });
Resource.register(wrapped, { type: { type: "integer", minimum: -(2 ** 31), maximum: 2 ** 31 - 1, default: 5 }, reduce: "+" });

const rows = 3000;
const positionAt = (i: number): Vec3 => [Math.sin(i) * 100, (i % 97) - 50, i / 7];
const massAt = (i: number): number => (i * 2654435761) >>> 20;

/** Rows in two archetypes, so a run folds more than one call's partials. */
const spawn = System.create({ name: "reductionsTest/spawn" }, ({ commands }) => {
    for (let i = 0; i < rows; i++) {
        if (i % 3 === 0) commands.spawn({ [position]: positionAt(i), [mass]: massAt(i), [heavy]: true });
        else commands.spawn({ [position]: positionAt(i), [mass]: massAt(i) });
    }
});

const kernel = System.create({ name: "reductionsTest/kernel", kernel: "cpu", components: { read: [position, mass] }, reduce: { [total]: "+", [low]: "min", [bits]: "|", [least]: "min" } }, (row, { reduce }) => {
    const [x, y, z] = row[position];
    reduce[total](row[mass]);
    reduce[total](0.5);
    reduce[low]([x, y, z]);
    reduce[bits](row[mass]);
    reduce[least](row[mass]);
});

/** The same reductions, run as written on the main thread. */
const body = System.create({ name: "reductionsTest/body", components: { read: [position, mass] }, reduce: { [total]: "+", [low]: "min", [bits]: "|", [least]: "min" } }, (row, { reduce }) => {
    const [x, y, z] = row[position];
    reduce[total](row[mass]);
    reduce[total](0.5);
    reduce[low]([x, y, z]);
    reduce[bits](row[mass]);
    reduce[least](row[mass]);
});

const filtered = System.create({ name: "reductionsTest/filtered", kernel: "cpu", components: { read: [mass], has: [heavy] }, resources: { changed: [level] }, reduce: { [total]: "+", [least]: "min" } }, (row, { reduce }) => {
    reduce[total](row[mass]);
    reduce[least](row[mass]);
});

const flags = System.create({ name: "reductionsTest/flags", kernel: "cpu", components: { read: [mass] }, reduce: { [any]: "|" } }, (row, { reduce }) => {
    reduce[any](row[mass] > 4000);
});

/** Two contributors to `total`, the heavy rows and the light ones, and a reader of the finished fold. */
const heavyMass = System.create({ name: "reductionsTest/heavy", kernel: "cpu", components: { read: [mass], has: [heavy] }, reduce: { [total]: "+" } }, (row, { reduce }) => {
    reduce[total](row[mass]);
});
const lightMass = System.create({ name: "reductionsTest/light", components: { read: [mass], not: [heavy] }, reduce: { [total]: "+" } }, (row, { reduce }) => {
    reduce[total](row[mass]);
});
const reader = System.create({ name: "reductionsTest/reader", resources: { read: [total], write: [seen] } }, ({ resources }) => {
    resources[seen] = resources[total];
});
const frame = System.composite({ name: "reductionsTest/frame", systems: [reader, heavyMass, lightMass] });

const weigh = System.create({ name: "reductionsTest/weigh", components: { write: [mass], has: [heavy] } }, row => { row[mass] = 1; });
const kernelChanged = System.create({ name: "reductionsTest/changed", kernel: "cpu", components: { read: [mass], changed: [mass] }, reduce: { [total]: "+" } }, (row, { reduce }) => {
    reduce[total](row[mass]);
});

const masses = (keep: (i: number) => boolean): number => Array.from({ length: rows }, (_, i) => i).filter(keep).reduce((sum, i) => sum + massAt(i), 0);

const expected = () => {
    const positions = Array.from({ length: rows }, (_, i) => positionAt(i));
    const values = Array.from({ length: rows }, (_, i) => massAt(i));
    return {
        total: masses(() => true) + rows * 0.5,
        low: [0, 1, 2].map(k => Math.fround(Math.min(...positions.map(p => p[k] ?? NaN)))),
        bits: values.reduce((or, value) => or | value, 0) >>> 0,
        least: Math.min(...values),
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
            await world.run(spawn);
            await world.run(system);
            const want = expected();
            const got = results(world);
            // Positions are f32, so their least is too; sums of integers and halves are exact.
            expect({ ...got, low: got.low?.map(Math.fround) }).toEqual(want);
            // A second run starts again from the operators' identities rather than adding to the fold.
            await world.run(system);
            expect(results(world).total).toBe(want.total);
            await world.dispose();
        });
    }

    it("fold every contributor in a run, start each run again, and give readers the finished fold", async () => {
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        // The reader is listed first, yet runs after both contributors.
        await world.run(frame);
        expect(world.read.resource(total)).toBe(masses(() => true));
        expect(world.read.resource(seen)).toBe(masses(() => true));
        await world.run(frame);
        expect(world.read.resource(total)).toBe(masses(() => true));
        // A run with one contributor holds that contributor's fold alone.
        await world.run(heavyMass);
        expect(world.read.resource(total)).toBe(masses(i => i % 3 === 0));
        await world.dispose();
    });

    it("keep the previous value when a contributor fails, or when every contributor skips the run", async () => {
        let fail = false;
        const fails = System.create({ name: "reductionsTest/fails", components: { read: [mass], has: [heavy] }, reduce: { [total]: "+" } }, (row, { reduce }) => {
            reduce[total](row[mass]);
            if (fail) throw new Error("contributor failed");
        });
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(fails);
        const before = world.read.resource(total);
        fail = true;
        expect((await world.run(fails)).failures.map(failure => failure.message)).toEqual(["contributor failed"]);
        expect(world.read.resource(total)).toBe(before);
        // A resource filter passes on its first run; after that `level` doesn't change, so its runs are skipped.
        await world.run(filtered);
        await world.run(lightMass);
        await world.run(filtered);
        expect(world.read.resource(total)).toBe(masses(i => i % 3 !== 0));
        await world.dispose();
    });

    it("fold to the identity over no rows, an empty min of integers as the type's extreme", async () => {
        const world = createWorld({ workers: 0 });
        await world.run(filtered);
        expect(world.read.resource(total)).toBe(0);
        expect(world.read.resource(least)).toBe(0xFFFFFFFF);
        await world.dispose();
    });

    it("fold only the rows a contributor's change filters pass", async () => {
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(kernelChanged);
        expect(world.read.resource(total)).toBe(masses(() => true));
        await world.run(weigh);
        await world.run(kernelChanged);
        expect(world.read.resource(total)).toBe(rows / 3);
        // Nothing changed since: the filter passes no rows, so the fold is empty.
        await world.run(kernelChanged);
        expect(world.read.resource(total)).toBe(0);
        await world.dispose();
    });

    it("stamp their resources changed only when the fold differs", async () => {
        let ran = 0;
        const watcher = System.create({ name: "reductionsTest/reader/2", components: { has: [mass] }, resources: { changed: [total] } }, () => { ran++; });
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(kernel);
        await world.run(watcher);
        const first = ran;
        expect(first).toBe(rows);
        await world.run(kernel);
        await world.run(watcher);
        expect(ran).toBe(first);
        await world.dispose();
    });

    it("store an infinite sum as any write of it, and only an empty min or max as the integer type's extreme", async () => {
        const infinite = System.create({ name: "reductionsTest/infinite", components: { has: [mass] }, reduce: { [wrapped]: "+" } }, (_, { reduce }) => {
            reduce[wrapped](Infinity);
        });
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(infinite);
        expect(world.read.resource(wrapped)).toBe(0);
        await world.dispose();
    });

    it("fold booleans bitwise", async () => {
        const world = createWorld({ workers: 0 });
        await world.run(spawn);
        await world.run(flags);
        expect(world.read.resource(any)).toBe(true);
        await world.dispose();
    });

    it("reject what can't be reduced", async () => {
        // @ts-expect-error booleans reduce bitwise
        expect(() => Resource.register(summed, { type: { type: "boolean", default: false }, reduce: "+" })).toThrow(`booleans reduce with "&", "|" or "^"`);
        // @ts-expect-error a contributor repeats its resource's operator
        const mismatched = System.create({ name: "reductionsTest/other", components: { has: [mass] }, reduce: { [total]: "max" } }, (_, { reduce }) => { reduce[total](1); });
        await expect(createWorld({ workers: 0 }).run(mismatched)).rejects.toThrow(`reduces "reductionsTest/total" with "max", but it's declared reduce: "+"`);
        // @ts-expect-error only a resource with a reduce trait is reduced
        const plain = System.create({ name: "reductionsTest/other/2", components: { has: [mass] }, reduce: { [level]: "+" } }, (_, { reduce }) => { reduce[level](1); });
        await expect(createWorld({ workers: 0 }).run(plain)).rejects.toThrow(`reduces "reductionsTest/level", which has no reduce trait`);
        // @ts-expect-error a reduced resource is never written
        const writing = System.create({ name: "reductionsTest/other/3", resources: { write: [total] } }, ({ resources }) => { resources[total] = 1; });
        await expect(createWorld({ workers: 0 }).run(writing)).rejects.toThrow(`writes "reductionsTest/total", which is reduced`);
        // @ts-expect-error a contributor doesn't read what it reduces into
        const reading = System.create({ name: "reductionsTest/other/4", components: { has: [mass] }, resources: { read: [total] }, reduce: { [total]: "+" } }, (_, { resources, reduce }) => { reduce[total](resources[total]); });
        await expect(createWorld({ workers: 0 }).run(reading)).rejects.toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
        // @ts-expect-error nor filters on it
        const filtering = System.create({ name: "reductionsTest/other/5", components: { has: [mass] }, resources: { changed: [total] }, reduce: { [total]: "+" } }, (_, { reduce }) => { reduce[total](1); });
        await expect(createWorld({ workers: 0 }).run(filtering)).rejects.toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
    });

    it("leave nothing subscribed to sync points from a registration that failed", () => {
        const state = createState(true);
        const registrar = createRegistrar(state);
        // @ts-expect-error a contributor repeats its resource's operator
        const mismatched = System.create({ name: "reductionsTest/other/6", components: { has: [mass] }, reduce: { [total]: "max" } }, (_, { reduce }) => { reduce[total](1); });
        const both = System.composite({ name: "reductionsTest/both", systems: [kernel, mismatched] });
        const definition = (system: System<unknown>) => {
            const found = definitionOf(system);
            if (found === undefined) throw new Error("not a system");
            return found;
        };
        expect(() => registrar.register(definition(both))).toThrow(`but it's declared reduce: "+"`);
        expect(state.afterSync.size).toBe(0);
        registrar.register(definition(kernel)).rollback();
        expect(state.afterSync.size).toBe(0);
    });
});
