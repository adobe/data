// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";

export const schema = { type: "string", enum: ["fixed", "point", "hinge", "cone"] } as const satisfies Schema;
