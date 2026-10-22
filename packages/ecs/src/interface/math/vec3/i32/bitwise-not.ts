// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 as Vec3_I32 } from "./i32.js";
import { intrinsic } from "../../intrinsic.js";

export const bitwiseNot = intrinsic({ wgsl: "~", form: "prefix", parameters: ["vec3i"], result: "vec3i" }, ([x, y, z]: Vec3_I32): Vec3_I32 => [~x, ~y, ~z]);
