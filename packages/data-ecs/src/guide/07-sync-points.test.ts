import { expect, it } from "vitest";
import { Component, Resource, System, World } from "../index.js";

const unit = "guide/sync/unit";
const shield = "guide/sync/shield";
const counted = "guide/sync/counted";

declare module "@adobe/data-ecs/components" {
    interface Types {
        [unit]: { type: number };
        [shield]: { type: true };
    }
}
declare module "@adobe/data-ecs/resources" {
    interface Types {
        [counted]: { type: number };
    }
}
declare module "@adobe/data-ecs/systems" {
    interface Types {
        "guide/sync/spawn": true;
        "guide/sync/count": true;
        "guide/sync/frame": true;
        "guide/sync/fail": true;
    }
}

Component.register(unit, { type: { type: "number" } });
Component.register(shield, { type: { const: true } });
Resource.register(counted, { type: { type: "number", default: 0 } });

// Commands are structural changes: they apply together at the sync point that ends each run.
const spawn = System.create({ name: "guide/sync/spawn" }, (_, __, commands) => {
    const entity = commands.spawn({ [unit]: 1 });
    commands.add(entity, { [shield]: true });
    commands.remove(entity, shield);
});
const count = System.create({ name: "guide/sync/count", query: { has: [unit] }, resources: { read: [counted], write: [counted] }, after: ["guide/sync/spawn"] }, (_, context) => {
    context[counted] += 1;
});
const frame = System.composite({ name: "guide/sync/frame", systems: [spawn, count] });

it("applies structural changes at the end of a run, as their net effect", async () => {
    await using world = await World.create({ systems: [frame] });
    await world.run(frame);
    // The spawn wasn't visible to a later system in the same run.
    expect(world.read.resource(counted)).toBe(0);
    await world.run(frame);
    expect(world.read.resource(counted)).toBe(1);
    // Added and removed within one sync point: never there.
    expect(world.query.count([shield])).toBe(0);
});

it("still applies the commands of a run whose system throws, then rejects", async () => {
    const fail = System.create({ name: "guide/sync/fail" }, (_, __, commands) => {
        commands.spawn({ [unit]: 2 });
        throw new Error("lost connection");
    });
    await using world = await World.create({ systems: [fail] });
    await expect(world.run(fail)).rejects.toThrow("lost connection");
    expect(world.query.count([unit])).toBe(1);
});
