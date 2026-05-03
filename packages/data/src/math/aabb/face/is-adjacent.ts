// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { getAdjacent } from "./get-adjacent.js";

/** True if the two faces share an edge */
export const isAdjacent = (face1: Face, face2: Face): boolean => {
    return getAdjacent(face1).includes(face2);
};
