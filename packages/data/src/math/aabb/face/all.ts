// © 2026 Adobe. MIT License. See /LICENSE for details.

import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

/** All six single-face bits */
export const ALL = POS_Z | POS_X | NEG_Z | NEG_X | POS_Y | NEG_Y;
