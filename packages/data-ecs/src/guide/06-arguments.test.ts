import { expect, it } from "vitest";
import { Component, System, Vec3, World } from "../index.js";

const position = "guide/arguments/position";

declare module "../component/types.js" {
    interface Types {
        [position]: { type: Vec3 };
    }
}
declare module "../system/types.js" {
    interface Types {
        "guide/arguments/place": true;
    }
}

Component.register(position, { type: Vec3.schema });

// Arguments are a schema for a read-only input to each run, so `(name, arguments)` is a replicable transaction.
const place = System.create({
    name: "guide/arguments/place",
    args: { type: "object", properties: { x: { type: "number" }, count: { type: "integer" } } },
}, (_, { args }, commands) => {
    for (let i = 0; i < args.count; i++) commands.spawn({ [position]: [args.x, i, 0] });
});

it("passes arguments to each run", async () => {
    await using world = await World.create({ systems: [place] });
    await world.run(place, { x: 3, count: 2 });
    const positions = world.query.select([position], { order: { [position]: true } }).map(entity => world.read.component(entity, position));
    expect(positions).toEqual([[3, 0, 0], [3, 1, 0]]);
});
