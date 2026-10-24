// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Mat4x4, Quat, Vec3 } from "../../interface/math/index.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const position = Symbol("builtinsTest/position");
const velocity = Symbol("builtinsTest/velocity");
const bits = Symbol("builtinsTest/bits");
const counts = Symbol("builtinsTest/counts");
const sums = Symbol("builtinsTest/sums");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [bits]: { type: Vec3.U32 };
        [counts]: { type: Vec3.U32 };
        [sums]: { type: Vec3.I32 };
    }
}


const spawn = System.create({}, ({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([position, velocity])({ [position]: [i, i % 5, -i], [velocity]: [1, 0.5 * (i % 3), 0.25] });
});

const rotation = Quat.fromAxisAngle([0, 1, 0], 0.5);
const matrix = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));

/** Rotates, transforms and offsets each position, with functions from three math namespaces inlined. */
const transform = System.create({ kernel: "cpu", components: { read: [velocity], write: [position] } }, row => {
    const q = Quat.fromAxisAngle([0, 1, 0], 0.5);
    const m = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));
    row[position] = Vec3.add(Mat4x4.multiplyVec3(m, Quat.rotateVec3(q, row[position])), Vec3.normalize(row[velocity]));
});

const expected = (p: Vec3, v: Vec3): Vec3 => Vec3.add(Mat4x4.multiplyVec3(matrix, Quat.rotateVec3(rotation, p)), Vec3.normalize(v));

const bitsAt = (i: number): Vec3.U32 => [Math.imul(i + 1, 0x9E3779B9) >>> 0, (0xFFFFFFFF - i) >>> 0, i << 26 >>> 0];
const sumsAt = (i: number): Vec3.I32 => [2 ** 31 - 1 - i, -(2 ** 31) + i, Math.imul(i, 65536)];

const spawnBits = System.create({}, ({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([bits, counts, sums])({ [bits]: bitsAt(i), [counts]: [0, 0, 0], [sums]: sumsAt(i) });
});

/** Integer functions that wrap, and bit functions without loops. */
const integerResults = (b: Vec3.U32, s: Vec3.I32): { readonly counts: Vec3.U32; readonly sums: Vec3.I32 } => ({
    counts: Vec3.U32.add(Vec3.U32.countOneBits(b), Vec3.U32.add(Vec3.U32.countTrailingZeros(b), Vec3.U32.multiply(Vec3.U32.reverseBits(b), b))),
    sums: Vec3.I32.add(Vec3.I32.multiply(s, [65536, 3, 65536]), Vec3.I32.abs(Vec3.I32.negate(s))),
});

const integers = System.create({ kernel: "cpu", components: { read: [bits], write: [counts, sums] } }, row => {
    const b = row[bits];
    const s = row[sums];
    row[counts] = Vec3.U32.add(Vec3.U32.countOneBits(b), Vec3.U32.add(Vec3.U32.countTrailingZeros(b), Vec3.U32.multiply(Vec3.U32.reverseBits(b), b)));
    row[sums] = Vec3.I32.add(Vec3.I32.multiply(s, [65536, 3, 65536]), Vec3.I32.abs(Vec3.I32.negate(s)));
});

describe("math in kernels", () => {
    for (const wasm of [false, true]) {
        it(`matches the functions called directly (${wasm ? "WASM" : "JS"})`, async () => {
            const world = createWorld({ [workers]: 0 }, { wasm });
            await world.run(spawn);
            await world.run(transform);
            const read = await readEach(world, await select(world, { required: [position] }), position);
            const want = Array.from({ length: 64 }, (_, i) => expected([i, i % 5, -i], [1, 0.5 * (i % 3), 0.25]));
            // Stored as f32, so compared at f32 precision.
            expect(read.map(value => value?.map(Math.fround))).toEqual(want.map(value => value.map(Math.fround)));
            await world.dispose();
        });
    }
    for (const wasm of [false, true]) {
        it(`wraps integers and counts bits as the functions do (${wasm ? "WASM" : "JS"})`, async () => {
            const world = createWorld({ [workers]: 0 }, { wasm });
            await world.run(spawnBits);
            await world.run(integers);
            const entities = await select(world, { required: [bits] });
            const want = Array.from({ length: 64 }, (_, i) => integerResults(bitsAt(i), sumsAt(i)));
            expect(await readEach(world, entities, counts)).toEqual(want.map(value => value.counts));
            expect(await readEach(world, entities, sums)).toEqual(want.map(value => value.sums));
            await world.dispose();
        });
    }
});
