// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PlayerMark } from "./player-mark.js";
import { schema } from "./schema.js";

const set: ReadonlySet<unknown> = new Set(schema.enum);

export const is = (value: unknown): value is PlayerMark => set.has(value);
