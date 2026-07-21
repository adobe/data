// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Boolean } from "@adobe/data/schema";

// A per-device preference for whether completed todos are shown. Bare schema
// here; the settings scope (nonShared — durable but local) is applied by
// `settings-database.ts` via `Database.scope.settings`.
export const displayCompleted = Boolean.schema;
