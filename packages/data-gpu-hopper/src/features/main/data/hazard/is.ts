// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Hazard } from "./hazard.js";

// A structural type guard, re-exported so it reads as `Hazard.is`. Discriminates a
// hazard entity value by the presence and primitive shape of its own components —
// no id, no tag (identity is the `State.entities` map key).
export const is = (v: unknown): v is Hazard =>
  typeof v === "object" &&
  v !== null &&
  "kind" in v &&
  typeof v.kind === "string" &&
  "lane" in v &&
  typeof v.lane === "number" &&
  "x" in v &&
  typeof v.x === "number" &&
  "width" in v &&
  typeof v.width === "number" &&
  "velocity" in v &&
  typeof v.velocity === "number";
