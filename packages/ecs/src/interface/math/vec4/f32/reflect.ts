import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { scale } from "./scale.js";
import { subtract } from "./subtract.js";
import { intrinsic } from "../../intrinsic.js";

export const reflect = intrinsic({ wgsl: "reflect", parameters: ["vec4f", "vec4f"], result: "vec4f" }, (i: F32, n: F32): F32 => {
    const dot2 = dot(n, i) * 2;
    return subtract(i, scale(n, dot2));
});
