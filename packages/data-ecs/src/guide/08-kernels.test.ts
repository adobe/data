import { expect, it } from "vitest";
import { Component, Entity, System, Vec3, World } from "../index.js";
import { steer } from "./08-steer.js";

const position = "guide/kernels/position";
const velocity = "guide/kernels/velocity";
const target = "guide/kernels/target";
const spark = "guide/kernels/spark";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [target]: { type: Entity };
        [spark]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(target, { type: Entity.schema });
Component.register(spark, { type: { const: true } });

const spawn = System.create({ name: "guide/kernels/spawn" }, ({ commands }) => {
    const leader = commands.spawn({ [position]: [10, 0, 0], [velocity]: [0, 0, 0] });
    commands.spawn({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [target]: leader });
});

// `kernel: "cpu"` compiles the body at build time, to run in chunks across workers as WASM where it can.
const integrate = System.create({ name: "guide/kernels/integrate", kernel: "cpu", components: { read: [velocity], write: [position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

// Kernels use lookups, imported pure functions and commands too.
const chase = System.create({
    name: "guide/kernels/chase",
    kernel: "cpu",
    components: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { lookup, commands }) => {
    const other = lookup.targets(row[target]);
    if (other === null) return;
    row[velocity] = steer(row[velocity], Vec3.subtract(other[position], row[position]), 2);
    // A kernel builds tuple values from their leaves.
    const [x, y, z] = row[position];
    if (Vec3.distance(other[position], row[position]) < 1) commands.spawn({ [position]: [x, y, z], [spark]: true });
});

it("runs systems compiled as kernels", async () => {
    await using world = World.create();
    await world.run(spawn);
    for (let step = 0; step < 6; step++) {
        await world.run(chase);
        await world.run(integrate);
    }
    const [follower] = world.query.select([target]);
    expect(world.read.component(follower, position)?.[0]).toBeGreaterThan(9);
    expect(world.query.count([spark])).toBeGreaterThan(0);
});
