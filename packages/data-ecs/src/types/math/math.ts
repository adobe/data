/** A 32-bit float. */
export type F32 = number;

/** An integer in [-2^31, 2^31). */
export type I32 = number;

/** An integer in [0, 2^32). */
export type U32 = number;

/** Vec2 is `Vec2.F32`; `Vec2.I32` and `Vec2.U32` hold integer vectors. */
export type Vec2 = Vec2.F32;
export declare namespace Vec2 {
    type F32 = readonly [number, number];
    type I32 = readonly [number, number];
    type U32 = readonly [number, number];
}

/** Vec3 is `Vec3.F32`; `Vec3.I32` and `Vec3.U32` hold integer vectors. */
export type Vec3 = Vec3.F32;
export declare namespace Vec3 {
    type F32 = readonly [number, number, number];
    type I32 = readonly [number, number, number];
    type U32 = readonly [number, number, number];
}

/** Vec4 is `Vec4.F32`; `Vec4.I32` and `Vec4.U32` hold integer vectors. */
export type Vec4 = Vec4.F32;
export declare namespace Vec4 {
    type F32 = readonly [number, number, number, number];
    type I32 = readonly [number, number, number, number];
    type U32 = readonly [number, number, number, number];
}

/** A rotation quaternion, `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number];

/** A 4x4 matrix in column-major order, as WebGPU lays it out: elements 12 to 14 are the translation. */
export type Mat4x4 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
