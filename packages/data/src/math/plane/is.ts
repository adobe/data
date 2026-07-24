// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import { distance } from "./distance.js";

export function is(value: any): value is Plane {
    return value && typeof value === 'object' && 'normal' in value && 'distance' in value;
}
