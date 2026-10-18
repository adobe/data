import { expect, it } from "vitest";
import { Component, Resource, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const unit = Symbol("guide/sync/unit");
const shield = Symbol("guide/sync/shield");
const counted = Symbol("guide/sync/counted");

declare module "@adobe/data-ecs" {
    interface Components {
        [unit]: { type: number };
        [shield]: { type: true };
    }
    interface Resources {
        [counted]: { type: number };
    }
}

Component.register(unit, { type: { type: "number" } });
Component.register(shield, { type: { const: true } });
Resource.register(counted, { type: { type: "number", default: 0 } });

// Commands are structural changes: they apply together at the sync point that ends each run.
const spawn = System.create({ name: "guide/sync/spawn" }, ({ commands }) => {
    const entity = commands.spawn({ [unit]: 1 });
    commands.add(entity, { [shield]: true });
    commands.remove(entity, shield);
});
const count = System.create({ name: "guide/sync/count", components: { has: [unit] }, resources: { write: [counted] }, after: [spawn] }, (_, { resources }) => {
    resources[counted] += 1;
});
const frame = System.composite({ name: "guide/sync/frame", systems: [spawn, count] });

it("applies structural changes at the end of a run, as their net effect", async () => {
    await using world = createWorld();
    await world.run(frame);
    // The spawn wasn't visible to a later system in the same run.
    expect(await toPromise(world.observe.resource(counted))).toBe(0);
    await world.run(frame);
    expect(await toPromise(world.observe.resource(counted))).toBe(1);
    // Added and removed within one sync point: never there.
    expect(await toPromise(world.observe.count({ required: [shield] }))).toBe(0);
});

it("still applies the commands of a run whose system throws, and reports the failure", async () => {
    const fail = System.create({ name: "guide/sync/fail" }, ({ commands }) => {
        commands.spawn({ [unit]: 2 });
        throw new Error("lost connection");
    });
    await using world = createWorld();
    const { failures } = await world.run(fail);
    expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "system", name: "guide/sync/fail", message: "lost connection" }]);
    expect(await toPromise(world.observe.count({ required: [unit] }))).toBe(1);
});
