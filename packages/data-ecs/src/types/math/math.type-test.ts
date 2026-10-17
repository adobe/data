import type { F32, I32, Mat4x4, Quat, U32, Vec2, Vec3, Vec4 } from '../index.js';

// Each vector type is its F32 form, with integer vectors nested beside it.
const position: Vec3 = [1, 2, 3];
const float: Vec3.F32 = position;
const integer: Vec3.I32 = [1, 2, 3];
const unsigned: Vec3.U32 = [7, 7, 7];
const texel: Vec2 = [1, 2];
const color: Vec4 = [0, 0, 0, 1];
const rotation: Quat = [0, 0, 0, 1];
const transform: Mat4x4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scalars: readonly [F32, I32, U32] = [0.5, -1, 1];

// @ts-expect-error a Vec3 has three elements
const wrong: Vec3 = [1, 2];
// @ts-expect-error vectors are read-only values
float[0] = 1;

export const used = [integer, unsigned, texel, color, rotation, transform, scalars, wrong];
