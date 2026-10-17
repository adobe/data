import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const step = intrinsic({ wgsl: "step", parameters: ["vec4f", "vec4f"], result: "vec4f" }, ([edge1, edge2, edge3, edge4]: F32, [x, y, z, w]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1,
    z < edge3 ? 0 : 1,
    w < edge4 ? 0 : 1
]);
