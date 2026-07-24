// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import { length } from "./length.js";
import { subtract } from "./subtract.js";

export const distance = (a: Quat, b: Quat): number => length(subtract(b, a));
