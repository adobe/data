// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";

export const schema = { enum: ["bunny", "fox"] } as const satisfies Schema;
