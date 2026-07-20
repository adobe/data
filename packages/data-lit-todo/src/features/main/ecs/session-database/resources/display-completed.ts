// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Boolean } from "@adobe/data/schema";

// A view toggle for whether completed todos are shown — session view state,
// not a saved preference. `nonPersistent: true` excludes it from snapshots.
export const displayCompleted = { ...Boolean.schema, nonPersistent: true };
