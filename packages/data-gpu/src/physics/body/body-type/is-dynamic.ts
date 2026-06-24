// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BodyType } from "./body-type.js";

/** True for bodies the solver integrates and writes back (vs static / kinematic). */
export function isDynamic(t: BodyType): boolean {
    return t === "dynamic";
}
