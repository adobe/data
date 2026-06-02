// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";

export const schema = { type: "string", enum: ["rubber", "wood", "stone", "steel", "ice"] } as const satisfies Schema;
