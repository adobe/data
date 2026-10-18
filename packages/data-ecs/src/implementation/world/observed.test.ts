import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

const value = Symbol("observedTest/value");
const seen = Symbol("observedTest/seen");
const flag = Symbol("observedTest/flag");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [seen]: { type: number };
        [flag]: { type: true };
    }
}

Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(seen, { type: { type: "number", precision: 1 } });
Component.register(flag, { type: { const: true } });

const seed = System.create({ name: "observedTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn({ [value]: i, [seen]: 0 });
});

/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ name: "observedTest/bump", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const watch = System.create({ name: "observedTest/watch", kernel: "cpu", components: { write: [seen], changed: [value] }, after: [bump] }, row => {
    row[seen] = row[seen] + 1;
});

/** Counts rows whose `value` was added since it last ran. */
const fresh = System.create({ name: "observedTest/fresh", components: { write: [seen], added: [value] } }, row => {
    row[seen] = row[seen] + 1;
});
const flagAll = System.create({ name: "observedTest/flagAll", components: { has: [value] } }, (row, { commands }) => {
    commands.add(row.entity, { [flag]: true });
});
const spawnOne = System.create({ name: "observedTest/spawnOne" }, ({ commands }) => {
    commands.spawn({ [value]: -1, [seen]: 0 });
});

describe("tick stamps only where observed", () => {
    it("keep `added` from the moment an observer registers, across archetype moves", async () => {
        const world = createWorld();
        await world.run(seed);
        const counts = async (): Promise<number[]> => (await readEach(world, await select(world, { required: [seen] }), seen)).map(value => value ?? -1);
        // Rows that existed before count as added once.
        await world.run(fresh);
        await world.run(fresh);
        expect(new Set(await counts())).toEqual(new Set([1]));
        // Moving archetype keeps a row's `added` tick: old rows aren't added again, and a new row still is.
        await world.run(spawnOne);
        await world.run(flagAll);
        await world.run(fresh);
        await world.run(fresh);
        expect((await counts()).filter(count => count === 1).length).toBe(3001);
        await world.dispose();
    });

    for (const wasm of [false, true]) {
        it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const world = createWorld({}, { wasm });
            await world.run(seed);
            await world.run(bump);
            // New observers see everything once.
            await world.run(watch);
            await world.run(watch);
            const seenAll = async (): Promise<number[]> => (await readEach(world, await select(world, { required: [seen] }), seen)).map(value => value ?? -1);
            expect(new Set(await seenAll())).toEqual(new Set([1]));
            // Writes after registering are stamped, so the observer sees each exactly once.
            await world.run(bump);
            await world.run(watch);
            await world.run(watch);
            expect(new Set(await seenAll())).toEqual(new Set([2]));
            await world.dispose();
        });
    }
});
