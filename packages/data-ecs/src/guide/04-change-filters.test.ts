import { expect, it } from "vitest";
import { Component, Entity, Resource, System, World } from "../index.js";

const score = "guide/filters/score";
const shown = "guide/filters/shown";
const level = "guide/filters/level";
const enemy = "guide/filters/enemy";

declare module "@adobe/data-ecs" {
    interface Components {
        [score]: { type: number };
        [shown]: { type: number };
        [enemy]: { type: true };
    }
    interface Resources {
        [level]: { type: number };
    }
    interface Systems {
        "guide/filters/load": true;
        "guide/filters/show": true;
        "guide/filters/bump": true;
    }
}

Component.register(score, { type: { type: "number" } });
Component.register(shown, { type: { type: "number" } });
Component.register(enemy, { type: { const: true } });
Resource.register(level, { type: { type: "number", default: 1 } });

// A resource in `changed` passes every run after it changes, and the first run: no run-once flag is needed.
const load = System.create({ name: "guide/filters/load", resources: { read: [level], changed: [level] } }, ({ resources, commands }) => {
    for (let i = 0; i < resources[level] * 2; i++) commands.spawn({ [score]: 0, [shown]: -1, [enemy]: true });
});
// `changed` passes rows written since this system last ran; each system sees each change once.
const show = System.create({ name: "guide/filters/show", components: { read: [score], write: [shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
// Only rows the body writes are marked changed, so a conditional write marks only the rows it reaches.
const bump = System.create({ name: "guide/filters/bump", input: Entity.schema, components: { write: [score] } }, (row, { input }) => {
    if (row.entity === input) row[score] += 10;
});

it("runs systems only for what changed since they last ran", async () => {
    await using world = await World.create({ systems: [load, show, bump] });
    await world.run(load);
    await world.run(load);
    expect(world.query.count([enemy])).toBe(2);
    await world.run(show);
    const [first, second] = world.query.select([score]);
    await world.run(bump, first);
    await world.run(show);
    expect(world.read.component(first, shown)).toBe(10);
    expect(world.read.component(second, shown)).toBe(0);
});
