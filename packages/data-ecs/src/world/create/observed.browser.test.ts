import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const value = "observedWorkersTest/value";
const seen = "observedWorkersTest/seen";

declare module "../../component/types.js" {
    export interface Types {
        [value]: number;
        [seen]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "observedWorkersTest/seed": true;
        "observedWorkersTest/bump": true;
        "observedWorkersTest/watch": true;
    }
}

Component.register(value, { type: "number", precision: 1 });
Component.register(seen, { type: "number", precision: 1 });

const seed = System.create({ name: "observedWorkersTest/seed" }, (_, __, commands) => {
    for (let i = 0; i < 3000; i++) commands.spawn({ [value]: i, [seen]: 0 });
});

/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ name: "observedWorkersTest/bump", kernel: "cpu", query: { read: [value], write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const watch = System.create({ name: "observedWorkersTest/watch", kernel: "cpu", query: { read: [seen], write: [seen], changed: [value] }, after: ["observedWorkersTest/bump"] }, row => {
    row[seen] = row[seen] + 1;
});

describe("tick stamps only where observed, on workers", () => {
    for (const wasm of [false, true]) {
        it(`start once an observer registers (${wasm ? "WASM" : "JS"} kernels)`, async () => {
            const world = createWorld({ wasm, workers: 2, minimumChunk: 64 });
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
