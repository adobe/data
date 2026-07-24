// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import { add } from "./add.js";
import { normalize } from "./normalize.js";
import { scale } from "./scale.js";

export const lerp = (q1: Quat, q2: Quat, t: number): Quat => {
    return normalize(add(scale(q1, 1 - t), scale(q2, t)));
};
