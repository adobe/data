import { expect, it } from "vitest";
import { Component, System, World } from "../index.js";

const health = "guide/scheduling/health";
const damage = "guide/scheduling/damage";

declare module "../component/types.js" {
    interface Types {
        [health]: { type: number };
        [damage]: { type: number };
    }
}
declare module "../system/types.js" {
    interface Types {
        "guide/scheduling/spawn": true;
        "guide/scheduling/hit": true;
        "guide/scheduling/heal": true;
        "guide/scheduling/frame": true;
        "guide/scheduling/unordered": true;
        "guide/scheduling/regenerate": true;
    }
}

Component.register(health, { type: { type: "number" } });
Component.register(damage, { type: { type: "number" } });

const spawn = System.create({ name: "guide/scheduling/spawn" }, (_, __, commands) => { commands.spawn({ [health]: 10, [damage]: 4 }); });
const hit = System.create({ name: "guide/scheduling/hit", query: { read: [health, damage], write: [health] } }, row => {
    row[health] -= row[damage];
});
// Ordering comes only from before, after and during; systems in one tier may run in parallel.
const heal = System.create({ name: "guide/scheduling/heal", query: { read: [health], write: [health] }, after: ["guide/scheduling/hit"] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
const frame = System.composite({ name: "guide/scheduling/frame", systems: [heal, hit] });

it("orders a composite's members by their constraints", async () => {
    await using world = await World.create({ systems: [spawn, frame] });
    await world.run(spawn);
    await world.run(frame);
    const [entity] = world.query.select([health]);
    // hit first, 10 - 4 = 6, then heal, min(12, 10); the other way round would end at 6.
    expect(world.read.component(entity, health)).toBe(10);
});

it("rejects two systems that write the same component without an order between them", async () => {
    const regenerate = System.create({ name: "guide/scheduling/regenerate", query: { read: [health], write: [health] } }, row => { row[health] += 1; });
    const unordered = System.composite({ name: "guide/scheduling/unordered", systems: [regenerate, hit] });
    await expect(World.create({ systems: [unordered] })).rejects.toThrow('"guide/scheduling/regenerate" and "guide/scheduling/hit"');
});
