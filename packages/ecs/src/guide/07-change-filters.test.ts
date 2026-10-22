// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Component, Resource, System, World } from "../index.js";

const score = Symbol("score");
const shown = Symbol("shown");
const boss = Symbol("boss");
const level = Symbol("level");
const paused = Symbol("paused");
const map = Symbol("map");
const steps = Symbol("steps");

declare module "@adobe/ecs" {
    interface Components {
        [score]: { type: number };
        [shown]: { type: number };
        [boss]: { type: true };
    }
    interface Resources {
        [level]: { type: number };
        [paused]: { type: boolean };
        [map]: { type: { readonly width: number } | null };
        [steps]: { type: number };
    }
}

Component.register(score, { type: { type: "number" } });
Component.register(shown, { type: { type: "number" } });
Component.register(boss, { type: { const: true } });
Resource.register(level, { type: { type: "number", default: 1 } });
Resource.register(paused, { type: { type: "boolean", default: false } });
Resource.register(map, { type: { anyOf: [{ type: "object", properties: { width: { type: "number" } } }, { type: "null" }] } });
Resource.register(steps, { type: { type: "number", default: 0 } });

// A resource in changed passes the first run and each run after it changes: no run-once flag needed.
const load = System.create({ resources: { read: [level], changed: [level] } }, ({ resources, commands }) => {
    commands.spawn([score, shown, boss])({ [score]: 0, [shown]: -1 });
    for (let i = 0; i < resources[level]; i++) commands.spawn([score, shown])({ [score]: 0, [shown]: -1 });
});
// A component in changed passes only rows written since this system last ran.
const show = System.create({ components: { read: [score], write: [shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
const bump = System.create({ components: { write: [score], has: [boss] } }, row => {
    row[score] += 10;
});

const shownValues: number[] = [];
const readShown = System.create({ observer: true, components: { read: [shown] } }, row => {
    shownValues.push(row[shown]);
});

it("runs systems only for what changed since they last ran", async () => {
    await using world = World.create();
    await world.run(load);
    await world.run(load);
    await world.run(readShown);
    expect(shownValues).toEqual([-1, -1]);
    await world.run(show);
    await world.run(bump);
    await world.run(show);
    shownValues.length = 0;
    await world.run(readShown);
    expect(shownValues.sort((a, b) => a - b)).toEqual([0, 10]);
});

// Runs only while each resource in is is neither null nor false, and each in not is; is reads it narrowed.
const step = System.create({ resources: { is: [map], not: [paused], write: [steps] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
const pause = System.create({ resources: { write: [paused] } }, ({ resources }) => { resources[paused] = true; });
const open = System.create({ resources: { write: [map] } }, ({ resources }) => { resources[map] = { width: 4 }; });

let stepped = 0;
const readSteps = System.create({ observer: true, resources: { read: [steps] } }, ({ resources }) => {
    stepped = resources[steps];
});

it("runs systems only while their conditions hold", async () => {
    await using world = World.create();
    await world.run(step);
    await world.run(open);
    await world.run(step);
    await world.run(pause);
    await world.run(step);
    await world.run(readSteps);
    expect(stepped).toBe(4);
});
