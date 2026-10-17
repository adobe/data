import type { F32 } from "./f32.js";
import { intrinsic } from "../../intrinsic.js";

export const step = intrinsic({ wgsl: "step", parameters: ["vec3f", "vec3f"], result: "vec3f" }, ([edge1, edge2, edge3]: F32, [x, y, z]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1,
    z < edge3 ? 0 : 1
]);
