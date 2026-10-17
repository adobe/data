import { expect, it } from "vitest";
import { Component, System, World } from "../index.js";
import { toPromise } from "../types/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const body = "guide/within/body";
const glow = "guide/within/glow";

declare module "@adobe/data-ecs" {
    interface Components {
        [body]: { type: number };
        [glow]: { type: number; within: typeof body };
    }
}

Component.register(body, { type: { type: "number" } });
// A component declared within a host exists only while the host does, whatever removes the host.
Component.register(glow, { type: { type: "number" }, within: body });

const spawn = System.create({ name: "guide/within/spawn" }, ({ commands }) => {
    commands.spawn({ [body]: 1, [glow]: 0.5 });
    // Added without its host: dropped.
    commands.spawn({ [glow]: 0.5 });
});
const strip = System.create({ name: "guide/within/strip", components: { has: [body] } }, (row, { commands }) => {
    commands.remove(row.entity, body);
});

it("removes a component with its host", async () => {
    await using world = createWorld();
    await world.run(spawn);
    expect(await toPromise(world.observe.count({ required: [glow] }))).toBe(1);
    await world.run(strip);
    expect(await toPromise(world.observe.count({ required: [glow] }))).toBe(0);
});
