// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PlayerMark } from "./player-mark.js";
import { schema } from "./schema.js";

export const values: readonly PlayerMark[] = schema.enum;
