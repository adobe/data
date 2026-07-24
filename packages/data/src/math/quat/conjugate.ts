// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";

export const conjugate = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
