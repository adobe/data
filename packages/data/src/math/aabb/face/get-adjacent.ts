// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

/** Single-face bits that share an edge with `face` */
export const getAdjacent = (face: Face): readonly Face[] => {
    switch (face) {
        case POS_Z:
        case NEG_Z:
            return [POS_X, NEG_X, POS_Y, NEG_Y];
        case POS_X:
        case NEG_X:
            return [POS_Z, NEG_Z, POS_Y, NEG_Y];
        case POS_Y:
        case NEG_Y:
            return [POS_Z, NEG_Z, POS_X, NEG_X];
        default:
            throw new Error(`Invalid face index: ${face}`);
    }
};
