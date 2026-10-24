// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System, Vec3, World } from "../../index.js";
import { Observe } from "../../observe/index.js";
import { position, spark, sparks } from "./kernel-imports-sparks.test-helper.js";
import { steer } from "./kernel-imports-steer.test-helper.js";
import { createWorld } from "../index.js";
import { workers } from "../../interface/resources/workers.js";

const velocity = Symbol("kernelImports/velocity");
const target = Symbol("kernelImports/target");

declare module "@adobe/ecs" {
    interface Components {
        [velocity]: { type: Vec3 };
        [target]: { type: Entity };
    }
}


const spawn = System.create({}, ({ commands }) => {
    const leader = commands.spawn([position, velocity])({ [position]: [10, 0, 0], [velocity]: [0, 0, 0] });
    commands.spawn([position, velocity, target])({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [target]: leader });
});

// `kernel: "cpu"` compiles the body at build time, to run in chunks across workers as WASM where it can.
const integrate = System.create({ kernel: "cpu", components: { read: [velocity], write: [position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

// Kernels use lookups, imported pure functions, commands and imported lists too.
const chase = System.create({
    kernel: "cpu",
    components: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { lookup, commands }) => {
    const other = lookup.targets(row[target]);
    if (other === null) return;
    row[velocity] = steer(row[velocity], Vec3.subtract(other[position], row[position]), 2);
    // A kernel builds tuple values from their leaves.
    const [x, y, z] = row[position];
    if (Vec3.distance(other[position], row[position]) < 1) commands.spawn(sparks)({ [position]: [x, y, z] });
});

it("runs systems compiled as kernels", async () => {
    await using world = createWorld({ [workers]: 0 });
    await world.run(spawn);
    for (let step = 0; step < 6; step++) {
        await world.run(chase);
        await world.run(integrate);
    }
    const [follower] = await Observe.toPromise(Observe.select(world, { required: [target] }));
    expect((await Observe.toPromise(Observe.entity(world, follower, { required: [position] })))?.[position][0]).toBeGreaterThan(9);
    expect(await Observe.toPromise(Observe.count(world, { required: [spark] }))).toBeGreaterThan(0);
});

// A kernel's `add` and `remove` take an imported `Symbol(...)` as one key, and an imported list as a list.
const ignite = System.create({}, ({ commands }) => {
    commands.spawn(sparks)({ [position]: [0, 0, 0] });
});
const settle = System.create({ kernel: "cpu", components: { has: [spark] } }, (row, { commands }) => {
    commands.remove(row.entity, spark);
});

it("removes an imported key in a kernel", async () => {
    await using world = createWorld({ [workers]: 0 });
    await world.run(ignite);
    await world.run(settle);
    expect(await Observe.toPromise(Observe.count(world, { required: [spark] }))).toBe(0);
    expect(await Observe.toPromise(Observe.count(world, { required: [position] }))).toBe(1);
});
