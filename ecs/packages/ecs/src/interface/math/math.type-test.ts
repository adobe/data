// © 2026 Adobe. MIT License. See /LICENSE for details.
import { F32, I32, Mat4x4, Quat, U32, Vec2, Vec3, Vec4 } from '../index.js';

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

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };
type Two = readonly [number, number];
type Three = readonly [number, number, number];
type Four = readonly [number, number, number, number];

// Each is the plain type its schema describes.
check<Equal<F32, number>>();
check<Equal<I32, number>>();
check<Equal<U32, number>>();
check<Equal<Vec2, Two>>();
check<Equal<Vec2.I32, Two>>();
check<Equal<Vec2.U32, Two>>();
check<Equal<Vec3, Three>>();
check<Equal<Vec3.I32, Three>>();
check<Equal<Vec3.U32, Three>>();
check<Equal<Vec4, Four>>();
check<Equal<Vec4.I32, Four>>();
check<Equal<Vec4.U32, Four>>();
check<Equal<Quat, Four>>();
check<Equal<Mat4x4, readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]>>();
