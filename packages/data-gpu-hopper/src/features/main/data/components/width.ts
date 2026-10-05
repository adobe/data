// © 2026 Adobe. MIT License. See /LICENSE for details.
import { F32, type Schema, Scope } from "@adobe/data/schema";

// A hazard's width in cells.
export const width = { ...F32.schema, ...Scope.session } satisfies Schema;
