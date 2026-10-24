// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { read, readResource, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const paused = Symbol("conditionsTest/paused");
const level = Symbol("conditionsTest/level");
const ticks = Symbol("conditionsTest/ticks");
const after = Symbol("conditionsTest/after");
const sizes = Symbol("conditionsTest/sizes");
const total = Symbol("conditionsTest/total");
const count = Symbol("conditionsTest/count");
const value = Symbol("conditionsTest/value");

declare module "@adobe/ecs" {
    interface Resources {
        [paused]: { type: boolean };
        [level]: { type: { readonly size: number } | null };
        [ticks]: { type: number };
        [after]: { type: number };
        [sizes]: { type: number };
        [total]: { type: number; reduce: "+" };
        [count]: { type: number };
    }
    interface Components {
        [value]: { type: number };
    }
}


const pause = System.create({  }, ({ resources }) => { resources[paused] = true; });
const tick = System.create({ resources: { not: [paused] } }, ({ resources }) => { resources[ticks] += 1; });
const afterTick = System.create({ after: [tick] }, ({ resources }) => { resources[after] += 1; });
const frame = System.create({ systems: [tick, afterTick] });
const grow = System.create({ kernel: true, components: { with: [value] }, resources: { not: [paused] } }, row => {
    row[value] = row[value] + 1;
});
const growWhilePaused = System.create({ kernel: true, components: { with: [value] }, resources: { is: [paused] } }, row => {
    row[value] = row[value] + 1;
});

describe("resource conditions", () => {
    it("skip a system while they don't hold, successfully, so systems after it still run", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(frame);
        await world.run(pause);
        await world.run(frame);
        expect(await readResource(world, ticks)).toBe(1);
        expect(await readResource(world, after)).toBe(2);
    });

    it("read an `is` condition as holding", async () => {
        await using world = createWorld({ [workers]: 0 });
        const measure = System.create({ resources: { is: [level] } }, ({ resources }) => { resources[sizes] = resources[level].size; });
        await world.run(measure);
        expect(await readResource(world, sizes)).toBe(0);
        const load = System.create({  }, ({ resources }) => { resources[level] = { size: 3 }; });
        await world.run(load);
        await world.run(measure);
        expect(await readResource(world, sizes)).toBe(3);
    });

    it("keep a skipped system's lastRun, so it sees every change once it runs again", async () => {
        await using world = createWorld({ [workers]: 0 });
        const seen: number[] = [];
        const watch = System.create({ components: { with: [value], changed: [value] }, resources: { is: [level] } }, row => { seen.push(row[value]); });
        const spawn = System.create({}, ({ commands }) => { commands.spawn([value])({ [value]: 7 }); });
        await world.run(spawn);
        await world.run(watch);
        expect(seen).toEqual([]);
        await world.run(System.create({  }, ({ resources }) => { resources[level] = { size: 1 }; }));
        await world.run(watch);
        expect(seen).toEqual([7]);
    });

    it("leave a reduced resource as it was when every contributor is skipped", async () => {
        await using world = createWorld({ [workers]: 0 });
        let next = 5;
        const add = System.create({ resources: { not: [paused] } }, ({ reduce }) => { reduce[total](next++); });
        await world.run(add);
        expect(await readResource(world, total)).toBe(5);
        await world.run(pause);
        await world.run(add);
        expect(await readResource(world, total)).toBe(5);
    });

    it("reject conditions that are never null or false, or listed twice, for untyped declarations, when declared", () => {
        // @ts-expect-error a number is never null or false
        expect(() => System.create({ resources: { is: [count] } }, () => {})).toThrow("which is never null or false");
        // @ts-expect-error both is and not
        expect(() => System.create({ resources: { is: [paused], not: [paused] } }, () => {})).toThrow("in both resources is and not");
    });
    it("skip a kernel the same way", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create({}, ({ commands }) => { commands.spawn([value])({ [value]: 1 }); }));
        await world.run(grow);
        await world.run(pause);
        await world.run(grow);
        const [entity] = await select(world, { required: [value] });
        expect(await read(world, entity, value)).toBe(2);
    });
    it("run a kernel only while its `is` condition holds", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create({}, ({ commands }) => { commands.spawn([value])({ [value]: 1 }); }));
        await world.run(growWhilePaused);
        await world.run(pause);
        await world.run(growWhilePaused);
        const [entity] = await select(world, { required: [value] });
        expect(await read(world, entity, value)).toBe(2);
    });
});
