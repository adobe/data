// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { type F32, System, Vec3, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const delta = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    interface Resources {
        [delta]: { type: F32; default: 0.5 };
    }
}

// A kernel is a body run once per row, each row on its own, so the world can split rows across workers and run them as
// WASM. A body that reads and writes only structs, calls math and touches no module state is one: the build compiles
// it, with results the same as the body as written.
const move = System.create({ components: { with: [velocity, position] } }, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// kernel: true asserts it: the build fails, saying why, if the body can't be one. It also computes f32 values at f32,
// which is faster on dense rows.
const drift = System.create({ kernel: true, components: { with: [velocity, position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

// kernel: false runs the body as written, on its thread: to step through it in a debugger, say.
const slow = System.create({ kernel: false, components: { with: [velocity] } }, row => {
    row[velocity] = Vec3.scale(row[velocity], 0.5);
});

const positions: Vec3[] = [];
const read = System.create({ observer: true, components: { with: [position] } }, row => {
    positions.push(row[position]);
});

const spawn = System.create(({ commands }) => {
    for (let i = 0; i < 3; i++) commands.spawn([position, velocity])({ [position]: [i, 0, 0], [velocity]: [2, 0, 0] });
});

it("runs bodies as kernels", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(move);
    await world.run(drift);
    await world.run(slow);
    await world.run(read);
    expect(positions.map(([x]) => x).sort()).toEqual([3, 4, 5]);
});
