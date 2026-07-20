// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";

export const lengthSquared = ([x, y, z, w]: Quat): number => x * x + y * y + z * z + w * w;
