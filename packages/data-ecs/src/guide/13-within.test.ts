import { expect, it } from "vitest";
import { Component, System, World } from "../index.js";

const body = "guide/within/body";
const glow = "guide/within/glow";

declare module "../component/types.js" {
    interface Types {
        [body]: { type: number };
        [glow]: { type: number; within: typeof body };
    }
}
declare module "../system/types.js" {
    interface Types {
        "guide/within/spawn": true;
        "guide/within/strip": true;
    }
}

Component.register(body, { type: { type: "number" } });
// A component declared within a host exists only while the host does, whatever removes the host.
Component.register(glow, { type: { type: "number" }, within: body });

const spawn = System.create({ name: "guide/within/spawn" }, (_, __, commands) => {
    commands.spawn({ [body]: 1, [glow]: 0.5 });
    // Added without its host: dropped.
    commands.spawn({ [glow]: 0.5 });
});
const strip = System.create({ name: "guide/within/strip", query: { has: [body] } }, (row, _, commands) => {
    commands.remove(row.entity, body);
});

it("removes a component with its host", async () => {
    await using world = await World.create({ systems: [spawn, strip] });
    await world.run(spawn);
    expect(world.query.count([glow])).toBe(1);
    await world.run(strip);
    expect(world.query.count([glow])).toBe(0);
});
