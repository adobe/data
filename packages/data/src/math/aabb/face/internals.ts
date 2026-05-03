// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../vec3/index.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

/** Ordered single-face bits for iteration */
export const FACES = [POS_Z, POS_X, NEG_Z, NEG_X, POS_Y, NEG_Y] as const;

const NORMAL_POS_Z: Vec3 = [0, 0, 1];
const NORMAL_NEG_Z: Vec3 = [0, 0, -1];
const NORMAL_POS_X: Vec3 = [1, 0, 0];
const NORMAL_NEG_X: Vec3 = [-1, 0, 0];
const NORMAL_POS_Y: Vec3 = [0, 1, 0];
const NORMAL_NEG_Y: Vec3 = [0, -1, 0];

/** Outward unit normal per single-face bit */
export const FACE_NORMALS = new Map<number, Vec3>([
    [POS_Z, NORMAL_POS_Z],
    [NEG_Z, NORMAL_NEG_Z],
    [POS_X, NORMAL_POS_X],
    [NEG_X, NORMAL_NEG_X],
    [POS_Y, NORMAL_POS_Y],
    [NEG_Y, NORMAL_NEG_Y],
]);

/** Debug labels per single-face bit */
export const FACE_NAMES = new Map<number, string>([
    [POS_Z, "POS_Z"],
    [POS_X, "POS_X"],
    [NEG_Z, "NEG_Z"],
    [NEG_X, "NEG_X"],
    [POS_Y, "POS_Y"],
    [NEG_Y, "NEG_Y"],
]);
