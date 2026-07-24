// © 2026 Adobe. MIT License. See /LICENSE for details.

// Pure spatial-partition helpers shared by the collision broad phase. A domain
// namespace over `Vec2` — no owned type, just the grid-cell rules that turn a
// continuous position into a discrete, indexable cell id.
export * as Spatial from "./public.js";
