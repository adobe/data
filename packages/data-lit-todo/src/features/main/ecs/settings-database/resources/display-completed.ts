// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Boolean } from "@adobe/data/schema";

// A per-device preference for whether completed todos are shown — durable
// (survives reload) but local: `nonShared: true` keeps it off the wire so one
// user's view toggle never changes what their peers see.
export const displayCompleted = { ...Boolean.schema, nonShared: true };
