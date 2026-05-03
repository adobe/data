// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { FACE_NAMES } from "./internals.js";

/** AABB face direction name for debugging/logging */
export const getName = (face: Face): string => {
    return FACE_NAMES.get(face) ?? `Unknown(${face})`;
};
