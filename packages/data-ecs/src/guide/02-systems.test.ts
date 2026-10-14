import { expect, it } from "vitest";
import { Component, Resource, System, Vec3, World } from "../index.js";

const position = "guide/systems/position";
const velocity = "guide/systems/velocity";
const frozen = "guide/systems/frozen";
const delta = "guide/systems/delta";
const frames = "guide/systems/frames";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [frozen]: { type: true };
    }
    interface Resources {
        [delta]: { type: number };
        [frames]: { type: number };
    }
    interface Systems {
        "guide/systems/spawn": true;
        "guide/systems/move": true;
        "guide/systems/count": true;
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(frozen, { type: { const: true } });
Resource.register(delta, { type: { type: "number", default: 0.5 } });
Resource.register(frames, { type: { type: "number", default: 0 } });

const spawn = System.create({ name: "guide/systems/spawn" }, ({ commands }) => {
    commands.spawn({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
    commands.spawn({ [position]: [0, 0, 0], [velocity]: [2, 0, 0], [frozen]: true });
});

// The row holds the components it reads and writes, `write` being readable too; values are replaced whole, never edited in place.
const move = System.create({
    name: "guide/systems/move",
    components: { read: [velocity], write: [position], not: [frozen] },
    resources: { read: [delta] },
}, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// Without components, a system runs once per run, and its body takes only the context.
const count = System.create({ name: "guide/systems/count", resources: { write: [frames] } }, ({ resources }) => {
    resources[frames] += 1;
});

it("runs a body for each row its components match", async () => {
    await using world = await World.create({ systems: [spawn, move, count] });
    await world.run(spawn);
    await world.run(move);
    expect(world.query.select([position], { not: [frozen] }).map(entity => world.read.component(entity, position))).toEqual([[1, 0, 0]]);
    expect(world.query.select([frozen]).map(entity => world.read.component(entity, position))).toEqual([[0, 0, 0]]);
    await world.run(count);
    expect(world.read.resource(frames)).toBe(1);
});
