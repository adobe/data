// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { getOpposite } from "./get-opposite.js";

/** True if the two faces are opposite single-face bits */
export const isOpposite = (face1: Face, face2: Face): boolean => {
    return getOpposite(face1) === face2;
};
