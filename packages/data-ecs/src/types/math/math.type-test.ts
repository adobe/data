import { Mat4x4, Quat, Vec2, Vec3, Vec4 } from '../index.js';

// Each type is also a namespace of functions; `Vec3` is `Vec3.F32`, with integer vectors nested beside it.
const position: Vec3 = [1, 2, 3];
const float: Vec3.F32 = Vec3.F32.add(position, [1, 1, 1]);
const integer: Vec3.I32 = Vec3.I32.add([1, 2, 3], [4, 5, 6]);
const unsigned: Vec3.U32 = Vec3.U32.bitwiseAnd([7, 7, 7], [1, 2, 4]);
const length: number = Vec3.length(float);
const texel: Vec2 = Vec2.scale([1, 2], 2);
const color: Vec4 = Vec4.mix([0, 0, 0, 1], [1, 1, 1, 1], 0.5);
const rotation: Quat = Quat.fromAxisAngle([0, 0, 1], length);
const transform: Mat4x4 = Mat4x4.multiply(Mat4x4.identity, Quat.toMat4(rotation));

// @ts-expect-error a Vec3 has three elements
const wrong: Vec3 = [1, 2];

export const used = [integer, unsigned, texel, color, transform, wrong];

// @ts-expect-error vectors are read-only values
position[0] = 1;
