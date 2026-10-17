import { expect, it } from "vitest";
import { Component, Entity, Resource, System, World } from "../index.js";
import { toPromise } from "../types/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const score = "guide/filters/score";
const shown = "guide/filters/shown";
const level = "guide/filters/level";
const enemy = "guide/filters/enemy";
const paused = "guide/filters/paused";
const map = "guide/filters/map";
const steps = "guide/filters/steps";

declare module "@adobe/data-ecs" {
    interface Components {
        [score]: { type: number };
        [shown]: { type: number };
        [enemy]: { type: true };
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
Component.register(enemy, { type: { const: true } });
Resource.register(level, { type: { type: "number", default: 1 } });
Resource.register(paused, { type: { type: "boolean", default: false } });
Resource.register(map, { type: { anyOf: [{ type: "object", properties: { width: { type: "number" } } }, { type: "null" }] } });
Resource.register(steps, { type: { type: "number", default: 0 } });

// A resource in `changed` passes every run after it changes, and the first run: no run-once flag is needed.
const load = System.create({ name: "guide/filters/load", resources: { read: [level], changed: [level] } }, ({ resources, commands }) => {
    for (let i = 0; i < resources[level] * 2; i++) commands.spawn({ [score]: 0, [shown]: -1, [enemy]: true });
});
// `changed` passes rows written since this system last ran; each system sees each change once.
const show = System.create({ name: "guide/filters/show", components: { read: [score], write: [shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
// Only rows the body writes are marked changed, so a conditional write marks only the rows it reaches.
const bump = System.create({ name: "guide/filters/bump", input: { type: "object", properties: { entity: Entity.schema } }, components: { write: [score] } }, (row, { input }) => {
    if (row.entity === input.entity) row[score] += 10;
});

it("runs systems only for what changed since they last ran", async () => {
    await using world = createWorld();
    await world.run(load);
    await world.run(load);
    expect(await toPromise(world.observe.count({ required: [enemy] }))).toBe(2);
    await world.run(show);
    const [first, second] = await toPromise(world.observe.select({ required: [score] }));
    await world.run(bump, { entity: first });
    await world.run(show);
    expect((await toPromise(world.observe.entity(first, { required: [shown] })))?.[shown]).toBe(10);
    expect((await toPromise(world.observe.entity(second, { required: [shown] })))?.[shown]).toBe(0);
});

// A system runs only while each resource in `is` is neither null nor false, and each in `not` is; otherwise it's
// skipped, which isn't a failure. `is` reads the value narrowed: here `map` isn't null.
const step = System.create({ name: "guide/filters/step", resources: { is: [map], not: [paused], write: [steps] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
const pause = System.create({ name: "guide/filters/pause", resources: { write: [paused] } }, ({ resources }) => { resources[paused] = true; });
const open = System.create({ name: "guide/filters/open", resources: { write: [map] } }, ({ resources }) => { resources[map] = { width: 4 }; });

it("runs systems only while their conditions hold", async () => {
    await using world = createWorld();
    await world.run(step);
    await world.run(open);
    await world.run(step);
    await world.run(pause);
    await world.run(step);
    expect(await toPromise(world.observe.resource(steps))).toBe(4);
});
