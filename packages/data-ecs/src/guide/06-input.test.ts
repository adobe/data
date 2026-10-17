import { expect, it } from "vitest";
import { Component, System, Vec3, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const position = "guide/input/position";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
    }
}

Component.register(position, { type: Vec3.schema });

// `input` is a schema for a read-only value passed to each run, so `(name, input)` is a replicable transaction.
const place = System.create({
    name: "guide/input/place",
    input: { type: "object", properties: { x: { type: "number" }, count: { type: "integer" } } },
}, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn({ [position]: [input.x, i, 0] });
});

it("passes an input to each run", async () => {
    await using world = createWorld();
    await world.run(place, { x: 3, count: 2 });
    const entities = await toPromise(world.observe.select({ required: [position], order: { [position]: true } }));
    const positions = await Promise.all(entities.map(async entity => (await toPromise(world.observe.entity(entity, { required: [position] })))?.[position]));
    expect(positions).toEqual([[3, 0, 0], [3, 1, 0]]);
});

// A composite takes every field of its members' inputs, and each member reads the fields it declares.
const drift = System.create({
    name: "guide/input/drift",
    input: { type: "object", properties: { dx: { type: "number" } } },
    components: { write: [position] },
}, (row, { input }) => {
    const [x, y, z] = row[position];
    row[position] = [x + input.dx, y, z];
});
const frame = System.composite({ name: "guide/input/frame", systems: [place, drift] });

it("passes a composite's input to its members", async () => {
    await using world = createWorld();
    await world.run(place, { x: 3, count: 2 });
    await world.run(frame, { x: 0, count: 1, dx: 1 });
    const entities = await toPromise(world.observe.select({ required: [position], order: { [position]: true } }));
    const positions = await Promise.all(entities.map(async entity => (await toPromise(world.observe.entity(entity, { required: [position] })))?.[position]));
    // drift moves the entities there before the run; the one place spawns arrives at its sync point.
    expect(positions).toEqual([[0, 0, 0], [4, 0, 0], [4, 1, 0]]);
});
