// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import { length } from "./length.js";
import { scale } from "./scale.js";

export const normalize = (q: Quat): Quat => {
    const len = length(q);
    return len === 0 ? [0, 0, 0, 1] : scale(q, 1 / len);
};
