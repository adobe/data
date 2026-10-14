import { expect, it } from "vitest";
import { Component, System, Vec3, World } from "../index.js";

const position = "guide/input/position";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
    }
    interface Systems {
        "guide/input/place": true;
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
    await using world = World.create();
    await world.run(place, { x: 3, count: 2 });
    const positions = world.query.select([position], { order: { [position]: true } }).map(entity => world.read.component(entity, position));
    expect(positions).toEqual([[3, 0, 0], [3, 1, 0]]);
});
