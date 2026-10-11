import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const value = "observedTest/value";
const seen = "observedTest/seen";
const flag = "observedTest/flag";

declare module "../../component/types.js" {
    export interface Types {
        [value]: number;
        [seen]: number;
        [flag]: true;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "observedTest/seed": true;
        "observedTest/bump": true;
        "observedTest/watch": true;
        "observedTest/fresh": true;
        "observedTest/flagAll": true;
        "observedTest/spawnOne": true;
    }
}

Component.register(value, { type: "number", precision: 1 });
Component.register(seen, { type: "number", precision: 1 });
Component.register(flag, { const: true });

const seed = System.create({ name: "observedTest/seed" }, (_, __, commands) => {
    for (let i = 0; i < 3000; i++) commands.spawn({ [value]: i, [seen]: 0 });
});

/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ name: "observedTest/bump", kernel: true, query: { read: [value], write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const watch = System.create({ name: "observedTest/watch", kernel: true, query: { read: [seen], write: [seen], changed: [value] }, after: ["observedTest/bump"] }, row => {
    row[seen] = row[seen] + 1;
});

/** Counts rows whose `value` was added since it last ran. */
const fresh = System.create({ name: "observedTest/fresh", query: { read: [seen], write: [seen], added: [value] } }, row => {
    row[seen] = row[seen] + 1;
});
const flagAll = System.create({ name: "observedTest/flagAll", query: { read: [value] } }, (row, _, commands) => {
    commands.add(row.entity, { [flag]: true });
});
const spawnOne = System.create({ name: "observedTest/spawnOne" }, (_, __, commands) => {
    commands.spawn({ [value]: -1, [seen]: 0 });
});

describe("tick stamps only where observed", () => {
    it("keep `added` from the moment an observer registers, across archetype moves", async () => {
        const world = createWorld();
        await world.systems.register(seed, flagAll, spawnOne);
        await world.run(seed);
        await world.systems.register(fresh);
        const counts = (): number[] => world.query.select([seen]).map(entity => world.read.component(entity, seen) ?? -1);
        // Rows that existed before count as added once.
        await world.run(fresh);
        await world.run(fresh);
        expect(new Set(counts())).toEqual(new Set([1]));
        // Moving archetype keeps a row's `added` tick: old rows aren't added again, and a new row still is.
        await world.run(spawnOne);
        await world.run(flagAll);
        await world.run(fresh);
        await world.run(fresh);
        expect(counts().filter(count => count === 1).length).toBe(3001);
        await world.dispose();
    });

    for (const wasm of [false, true]) {
        it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const world = createWorld({ wasm });
            await world.systems.register(seed, bump);
            await world.run(seed);
            await world.run(bump);
            await world.systems.register(watch);
            // New observers see everything once.
            await world.run(watch);
            await world.run(watch);
            const seenAll = (): number[] => world.query.select([seen]).map(entity => world.read.component(entity, seen) ?? -1);
            expect(new Set(seenAll())).toEqual(new Set([1]));
            // Writes after registering are stamped, so the observer sees each exactly once.
            await world.run(bump);
            await world.run(watch);
            await world.run(watch);
            expect(new Set(seenAll())).toEqual(new Set([2]));
            await world.dispose();
        });
    }
});
