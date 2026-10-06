// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { Schema } from "@adobe/data/schema";

// The board row a hazard moves along.
export const lane = { type: "integer", minimum: 0, ...Scope.session } as const satisfies Schema;
