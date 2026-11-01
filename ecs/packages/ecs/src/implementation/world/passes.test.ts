// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { runRan, runReported } from "./outcomes.test-helper.js";

const seed = Symbol("passesTest/seed");
const event = Symbol("passesTest/event");

declare module "@adobe/ecs" {
    export interface Components {
        [seed]: { type: number };
        [event]: { type: number };
    }
}

/** What the systems below ran, in order. */
const order: string[] = [];
let firing = false;

const plant = System.create(({ commands }) => { commands.spawn([seed])({ [seed]: 1 }); });
const emit = System.create({ components: { with: [seed] } }, (row, { commands }) => {
    order.push("emit");
    if (firing) commands.spawn([event])({ [event]: row[seed] });
});
const handle = System.create({ components: { with: [event] }, after: [emit] }, row => { order.push(`handle ${row[event]}`); });
const finish = System.create({ after: [handle] }, () => { order.push("finish"); });
const chain = System.create([emit, handle, finish]);

const fail = System.create({ components: { with: [seed] }, after: [emit] }, () => {
    order.push("fail");
    throw new Error("passesTest: fail");
});
const afterFail = System.create({ after: [fail] }, () => { order.push("after fail"); });
const failing = System.create([emit, fail, afterFail]);

describe("tiers on the world's thread", () => {
    it("run one after another past sync points that apply nothing, and apply one with commands before the tier after it", async () => {
        expect(System.describe(chain).tiers.map(tier => tier.sync === null)).toEqual([false, true, true]);
        await using world = createWorld({ [workers]: 0 });
        await world.run(plant);
        order.length = 0;
        firing = false;
        expect((await runRan(world, chain)).systems).toBe(3);
        firing = true;
        expect((await runRan(world, chain)).systems).toBe(3);
        expect(order).toEqual(["emit", "finish", "emit", "handle 1", "finish"]);
    });

    it("stop at a tier whose system fails, skipping those after it", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(plant);
        order.length = 0;
        firing = false;
        const reported = await runReported(world, failing);
        expect([reported.failures.map(failure => failure.message), reported.skipped]).toEqual([["passesTest: fail"], [afterFail.name]]);
        expect(order).toEqual(["emit", "fail"]);
        expect((await runRan(world, failing)).systems).toBe(2);
    });
});
