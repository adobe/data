// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS indexes — lookups the store maintains over entity components.
import type { CoreDatabase } from "../core-database.js";

export const byComplete = { key: "complete" } as const satisfies CoreDatabase.Index;
