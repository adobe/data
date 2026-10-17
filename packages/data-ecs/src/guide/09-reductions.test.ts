import { expect, it } from "vitest";
import { Component, Resource, System, Vec3, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const position = "guide/reductions/position";
const mass = "guide/reductions/mass";
const total = "guide/reductions/total";
const lowest = "guide/reductions/lowest";
const seen = "guide/reductions/seen";
const cargo = "guide/reductions/cargo";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [mass]: { type: number };
        [cargo]: { type: number };
    }
    interface Resources {
        [total]: { type: number; reduce: "+" };
        [lowest]: { type: Vec3; reduce: "min" };
        [seen]: { type: number };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(mass, { type: { type: "number" } });
Component.register(cargo, { type: { type: "number" } });
// A reduced resource declares its operator; each run that a contributor runs in starts it at the operator's identity.
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(lowest, { type: { ...Vec3.schema, default: [0, 0, 0] }, reduce: "min" });
Resource.register(seen, { type: { type: "number", default: 0 } });

const spawn = System.create({ name: "guide/reductions/spawn" }, ({ commands }) => {
    for (let i = 0; i < 100; i++) commands.spawn({ [position]: [i, -i, i % 7], [mass]: 2 });
    for (let i = 0; i < 10; i++) commands.spawn({ [cargo]: 5 });
});

// A contributor repeats the operator, and each row contributes values that fold into the resource, across workers.
const measure = System.create({
    name: "guide/reductions/measure",
    kernel: "cpu",
    components: { read: [position, mass] },
    reduce: { [total]: "+", [lowest]: "min" },
}, (row, { reduce }) => {
    const [x, y, z] = row[position];
    reduce[total](row[mass]);
    reduce[lowest]([x, y, z]);
});

// A second contributor to the same total, over other rows.
const weigh = System.create({ name: "guide/reductions/weigh", components: { read: [cargo] }, reduce: { [total]: "+" } }, (row, { reduce }) => {
    reduce[total](row[cargo]);
});

// A reader of a reduced resource runs after every contributor in its run, so it sees the finished fold.
const report = System.create({ name: "guide/reductions/report", resources: { read: [total], write: [seen] } }, ({ resources }) => {
    resources[seen] = resources[total];
});
const frame = System.composite({ name: "guide/reductions/frame", systems: [report, measure, weigh] });

it("folds rows into resources", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(measure);
    expect(await toPromise(world.observe.resource(total))).toBe(200);
    expect(await toPromise(world.observe.resource(lowest))).toEqual([0, -99, 0]);
});

it("folds every contributor in a run, starting again each run", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(frame);
    await world.run(frame);
    expect(await toPromise(world.observe.resource(total))).toBe(250);
    expect(await toPromise(world.observe.resource(seen))).toBe(250);
});
