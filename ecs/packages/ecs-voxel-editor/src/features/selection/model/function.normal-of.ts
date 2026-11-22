// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** The unit normal of a side, `0` to `5`: `+x`, `-x`, `+y`, `-y`, `+z` and `-z`. */
export const normalOf = (side: number): Vec3.I32 => normals[side] ?? [0, 0, 0];

const normals: readonly Vec3.I32[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
