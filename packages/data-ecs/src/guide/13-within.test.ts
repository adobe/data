import { expect, it } from "vitest";
import { Component, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const body = Symbol("guide/within/body");
const glow = Symbol("guide/within/glow");
const inner = Symbol("guide/within/inner");
const outer = Symbol("guide/within/outer");

declare module "@adobe/data-ecs" {
    interface Components {
        [body]: { type: number };
        [glow]: { type: number; within: typeof body };
        [inner]: { type: true; within: typeof outer };
        [outer]: { type: true; within: typeof inner };
    }
}

Component.register(body, { type: { type: "number" } });
// A component declared within a host exists only while the host does, whatever removes the host.
Component.register(glow, { type: { type: "number" }, within: body });

const spawn = System.create({ name: "guide/within/spawn" }, ({ commands }) => {
    commands.spawn([body, glow])({ [body]: 1, [glow]: 0.5 });
    // Added without its host: dropped.
    commands.spawn([glow])({ [glow]: 0.5 });
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

it("rejects components within each other in a cycle where the one closing it registers", () => {
    Component.register(inner, { type: { const: true }, within: outer });
    expect(() => Component.register(outer, { type: { const: true }, within: inner })).toThrow("components are within each other in a cycle: guide/within/inner, guide/within/outer");
});
