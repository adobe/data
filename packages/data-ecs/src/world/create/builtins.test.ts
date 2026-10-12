import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Mat4x4, Quat, Vec3 } from "../../math/index.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const position = "builtinsTest/position";
const velocity = "builtinsTest/velocity";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec3;
        [velocity]: Vec3;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "builtinsTest/spawn": true;
        "builtinsTest/transform": true;
    }
}

Component.register(position, Vec3.schema);
Component.register(velocity, Vec3.schema);

const spawn = System.create({ name: "builtinsTest/spawn" }, (_, __, commands) => {
    for (let i = 0; i < 64; i++) commands.spawn({ [position]: [i, i % 5, -i], [velocity]: [1, 0.5 * (i % 3), 0.25] });
});

const rotation = Quat.fromAxisAngle([0, 1, 0], 0.5);
const matrix = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));

/** Rotates, transforms and offsets each position, with functions from three math namespaces inlined. */
const transform = System.create({ name: "builtinsTest/transform", kernel: "cpu", query: { read: [position, velocity], write: [position] } }, row => {
    const q = Quat.fromAxisAngle([0, 1, 0], 0.5);
    const m = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));
    row[position] = Vec3.add(Mat4x4.multiplyVec3(m, Quat.rotateVec3(q, row[position])), Vec3.normalize(row[velocity]));
});

const expected = (p: Vec3, v: Vec3): Vec3 => Vec3.add(Mat4x4.multiplyVec3(matrix, Quat.rotateVec3(rotation, p)), Vec3.normalize(v));

describe("math in kernels", () => {
    for (const wasm of [false, true]) {
        it(`matches the functions called directly (${wasm ? "WASM" : "JS"})`, async () => {
            const world = createWorld({ workers: 0, wasm });
            await world.systems.register(spawn, transform);
            await world.run(spawn);
            await world.run(transform);
            const read = world.query.select([position]).map(entity => world.read.component(entity, position));
            const want = Array.from({ length: 64 }, (_, i) => expected([i, i % 5, -i], [1, 0.5 * (i % 3), 0.25]));
            // Stored as f32, so compared at f32 precision.
            expect(read.map(value => value?.map(Math.fround))).toEqual(want.map(value => value.map(Math.fround)));
            await world.dispose();
        });
    }
});
