// © 2026 Adobe. MIT License. See /LICENSE for details.

// The colour filter applied to the whole scene. A pure, serializable value; the
// human-readable label for each kind is presentation and lives in `ui/`.
export type FilterKind = "none" | "sepia" | "blur" | "vintage" | "night";
export * as FilterKind from "./public.js";
