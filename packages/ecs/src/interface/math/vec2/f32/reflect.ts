// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { scale } from "./scale.js";
import { subtract } from "./subtract.js";
import { intrinsic } from "../../intrinsic.js";

export const reflect = intrinsic({ wgsl: "reflect", parameters: ["vec2f", "vec2f"], result: "vec2f" }, (i: F32, n: F32): F32 => {
    const dot2 = dot(n, i) * 2;
    return subtract(i, scale(n, dot2));
});
