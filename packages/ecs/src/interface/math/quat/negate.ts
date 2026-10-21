import type { Quat } from "../index.js";
import { intrinsic } from "../intrinsic.js";

export const negate = intrinsic({ wgsl: "-", form: "prefix", parameters: ["vec4f"], result: "vec4f" }, ([x, y, z, w]: Quat): Quat => [-x, -y, -z, -w]);
