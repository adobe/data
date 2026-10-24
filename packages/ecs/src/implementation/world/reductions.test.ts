// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { type I32, type U32, Vec3 } from "../../interface/math/index.js";
import { registerResource } from "../../interface/registry/declarations.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { readResource } from "./reads.test-helper.js";
import { definitionOf } from "../../interface/registry/index.js";
import type { Name } from "../../interface/system/name.js";
import { createRegistrar } from "./register.js";
import { createState } from "./state.js";
import { giveAccess } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { runReported } from "./reports.test-helper.js";

const position = Symbol("reductionsTest/position");
const mass = Symbol("reductionsTest/mass");
const heavy = Symbol("reductionsTest/heavy");
const total = Symbol("reductionsTest/total");
const low = Symbol("reductionsTest/low");
const bits = Symbol("reductionsTest/bits");
const least = Symbol("reductionsTest/least");
const any = Symbol("reductionsTest/any");
const level = Symbol("reductionsTest/level");
const seen = Symbol("reductionsTest/seen");
const wrapped = Symbol("reductionsTest/wrapped");
const summed = Symbol("reductionsTest/summed");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [mass]: { type: U32 };
        [heavy]: { type: true };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [low]: { type: Vec3; reduce: "min" };
        [bits]: { type: U32; reduce: "|" };
        [least]: { type: U32; reduce: "min" };
        [any]: { type: boolean; reduce: "|" };
        [level]: { type: number };
        [seen]: { type: number };
        [wrapped]: { type: I32; default: 5; reduce: "+" };
    }
}

const rows = 3000;
const positionAt = (i: number): Vec3 => [Math.sin(i) * 100, (i % 97) - 50, i / 7];
const massAt = (i: number): number => (i * 2654435761) >>> 20;

/** Rows in two archetypes, so a run folds more than one call's partials. */
const spawn = System.create({}, ({ commands }) => {
    for (let i = 0; i < rows; i++) {
        if (i % 3 === 0) commands.spawn([position, mass, heavy])({ [position]: positionAt(i), [mass]: massAt(i), [heavy]: true });
        else commands.spawn([position, mass])({ [position]: positionAt(i), [mass]: massAt(i) });
    }
});

const kernel = System.create({ kernel: true, components: { with: [position, mass] } }, (row, { reduce }) => {
    const [x, y, z] = row[position];
    reduce[total](row[mass]);
    reduce[total](0.5);
    reduce[low]([x, y, z]);
    reduce[bits](row[mass]);
    reduce[least](row[mass]);
});

/** The same reductions, run as written on the main thread. */
const body = System.create({ components: { with: [position, mass] } }, (row, { reduce }) => {
    const [x, y, z] = row[position];
    reduce[total](row[mass]);
    reduce[total](0.5);
    reduce[low]([x, y, z]);
    reduce[bits](row[mass]);
    reduce[least](row[mass]);
});

const filtered = System.create({ kernel: true, components: { with: [mass, heavy] }, resources: { changed: [level] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
    reduce[least](row[mass]);
});

const flags = System.create({ kernel: true, components: { with: [mass] } }, (row, { reduce }) => {
    reduce[any](row[mass] > 4000);
});

/** Two contributors to `total`, the heavy rows and the light ones, and a reader of the finished fold. */
const heavyMass = System.create({ kernel: true, components: { with: [mass, heavy] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
});
const lightMass = System.create({ components: { with: [mass], not: [heavy] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
});
const reader = System.create({}, ({ resources }) => {
    resources[seen] = resources[total];
});
const frame = System.create({ systems: [reader, heavyMass, lightMass] });

const weigh = System.create({ components: { with: [mass, heavy] } }, row => { row[mass] = 1; });
const kernelChanged = System.create({ kernel: true, components: { with: [mass], changed: [mass] } }, (row, { reduce }) => {
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

const results = async (world: ReturnType<typeof createWorld>) => ({
    total: await readResource(world, total),
    low: await readResource(world, low),
    bits: await readResource(world, bits),
    least: await readResource(world, least),
});

describe("reductions", () => {
    const cases: readonly { readonly label: string; readonly system: typeof kernel | typeof body; readonly wasm: boolean }[] = [
        { label: "JS kernel", system: kernel, wasm: false }, { label: "WASM kernel", system: kernel, wasm: true }, { label: "main-thread body", system: body, wasm: true },
    ];
    for (const { label, system, wasm } of cases) {
        it(`fold every row's contributions into their resources (${label})`, async () => {
            const world = createWorld({ [workers]: 0 }, { wasm });
            await world.run(spawn);
            await world.run(system);
            const want = expected();
            const got = await results(world);
            // Positions are f32, so their least is too; sums of integers and halves are exact.
            expect({ ...got, low: got.low?.map(Math.fround) }).toEqual(want);
            // A second run starts again from the operators' identities rather than adding to the fold.
            await world.run(system);
            expect((await results(world)).total).toBe(want.total);
            await world.dispose();
        });
    }

    it("fold every contributor in a run, start each run again, and give readers the finished fold", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        // The reader is listed first, yet runs after both contributors.
        await world.run(frame);
        expect(await readResource(world, total)).toBe(masses(() => true));
        expect(await readResource(world, seen)).toBe(masses(() => true));
        await world.run(frame);
        expect(await readResource(world, total)).toBe(masses(() => true));
        // A run with one contributor holds that contributor's fold alone.
        await world.run(heavyMass);
        expect(await readResource(world, total)).toBe(masses(i => i % 3 === 0));
        await world.dispose();
    });

    it("keep the previous value when a contributor fails, or when every contributor skips the run", async () => {
        let fail = false;
        const fails = System.create({ components: { with: [mass, heavy] } }, (row, { reduce }) => {
            reduce[total](row[mass]);
            if (fail) throw new Error("contributor failed");
        });
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(fails);
        const before = await readResource(world, total);
        fail = true;
        expect((await runReported(world, fails)).failures.map(failure => failure.message)).toEqual(["contributor failed"]);
        expect(await readResource(world, total)).toBe(before);
        // A resource filter passes on its first run; after that `level` doesn't change, so its runs are skipped.
        await world.run(filtered);
        await world.run(lightMass);
        await world.run(filtered);
        expect(await readResource(world, total)).toBe(masses(i => i % 3 !== 0));
        await world.dispose();
    });

    it("fold to the identity over no rows, an empty min of integers as the type's extreme", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(filtered);
        expect(await readResource(world, total)).toBe(0);
        expect(await readResource(world, least)).toBe(0xFFFFFFFF);
        await world.dispose();
    });

    it("fold only the rows a contributor's change filters pass", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(kernelChanged);
        expect(await readResource(world, total)).toBe(masses(() => true));
        await world.run(weigh);
        await world.run(kernelChanged);
        expect(await readResource(world, total)).toBe(rows / 3);
        // Nothing changed since: the filter passes no rows, so the fold is empty.
        await world.run(kernelChanged);
        expect(await readResource(world, total)).toBe(0);
        await world.dispose();
    });

    it("stamp their resources changed only when the fold differs", async () => {
        let ran = 0;
        const watcher = System.create({ components: { with: [mass] }, resources: { changed: [total] } }, () => { ran++; });
        const world = createWorld({ [workers]: 0 });
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
        const infinite = System.create({ components: { with: [mass] } }, (_, { reduce }) => {
            reduce[wrapped](Infinity);
        });
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(infinite);
        expect(await readResource(world, wrapped)).toBe(0);
        await world.dispose();
    });

    it("fold booleans bitwise", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(flags);
        expect(await readResource(world, any)).toBe(true);
        await world.dispose();
    });

    it("reject what can't be reduced", async () => {
        // Booleans reduce bitwise.
        expect(() => registerResource(summed, { type: { type: "boolean", default: false }, reduce: "+" })).toThrow(`booleans reduce with "&", "|" or "^"`);
        // @ts-expect-error only a resource with a reduce trait is reduced
        expect(() => System.create({ components: { with: [mass] } }, (_, { reduce }) => { reduce[level](1); })).toThrow(`reduces "reductionsTest/level", which has no reduce trait`);
        // @ts-expect-error a reduced resource is never written
        expect(() => System.create({}, ({ resources }) => { resources[total] = 1; })).toThrow(`writes "reductionsTest/total", which is reduced`);
        // A contributor doesn't read what it reduces into.
        expect(() => System.create({ components: { with: [mass] } }, (_, { resources, reduce }) => { reduce[total](resources[total]); })).toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
        // Nor filters on it.
        expect(() => System.create({ components: { with: [mass] }, resources: { changed: [total] } }, (_, { reduce }) => { reduce[total](1); })).toThrow(`reduces "reductionsTest/total", so it can't also read, write or filter on it`);
    });

    it("leave nothing subscribed to sync points from a registration that failed", () => {
        const state = createState(true);
        const registrar = createRegistrar(state);
        // A call the build doesn't see is a kernel it didn't compile, which only a world's registration finds.
        const unseen = System.create;
        const uncompiled = giveAccess({ kernel: true, components: { with: [mass] } } as const, { read: [mass] });
        const both = System.create({ systems: [kernel, unseen(uncompiled, row => { void row[mass]; })] });
        const definition = (system: System<unknown>) => {
            const found = definitionOf(system);
            if (found === undefined) throw new Error("not a system");
            return found;
        };
        expect(() => registrar.register(definition(both))).toThrow(`is a kernel but wasn't compiled`);
        expect(state.afterSync.size).toBe(0);
        registrar.register(definition(kernel)).rollback();
        expect(state.afterSync.size).toBe(0);
    });
});
