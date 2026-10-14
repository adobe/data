import { expect, it } from "vitest";
import { Component, Resource, System, Vec3, World } from "../index.js";

const position = "guide/reductions/position";
const mass = "guide/reductions/mass";
const total = "guide/reductions/total";
const lowest = "guide/reductions/lowest";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [mass]: { type: number };
    }
    interface Resources {
        [total]: { type: number };
        [lowest]: { type: Vec3 };
    }
    interface Systems {
        "guide/reductions/spawn": true;
        "guide/reductions/measure": true;
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(mass, { type: { type: "number" } });
Resource.register(total, { type: { type: "number", default: 0 } });
Resource.register(lowest, { type: { ...Vec3.schema, default: [0, 0, 0] } });

const spawn = System.create({ name: "guide/reductions/spawn" }, (_, __, commands) => {
    for (let i = 0; i < 100; i++) commands.spawn({ [position]: [i, -i, i % 7], [mass]: 2 });
});

// A reduction folds what each row contributes into a resource, across workers, replacing it each run.
const measure = System.create({
    name: "guide/reductions/measure",
    kernel: "cpu",
    query: { read: [position, mass] },
    resources: { reduce: { [total]: "+", [lowest]: "min" } },
}, (row, context) => {
    const [x, y, z] = row[position];
    context[total](row[mass]);
    context[lowest]([x, y, z]);
});

it("folds rows into resources", async () => {
    await using world = await World.create({ systems: [spawn, measure] });
    await world.run(spawn);
    await world.run(measure);
    await world.run(measure);
    expect(world.read.resource(total)).toBe(200);
    expect(world.read.resource(lowest)).toEqual([0, -99, 0]);
});
