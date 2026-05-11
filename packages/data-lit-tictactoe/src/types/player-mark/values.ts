// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PlayerMark } from "./player-mark";
import { schema } from "./schema";

export const values: readonly PlayerMark[] = schema.enum;
