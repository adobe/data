// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

/** Opposite single-face bit */
export const getOpposite = (face: Face): Face => {
    switch (face) {
        case POS_Z:
            return NEG_Z;
        case NEG_Z:
            return POS_Z;
        case POS_X:
            return NEG_X;
        case NEG_X:
            return POS_X;
        case POS_Y:
            return NEG_Y;
        case NEG_Y:
            return POS_Y;
        default:
            throw new Error(`Invalid face index: ${face}`);
    }
};
