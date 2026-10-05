// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LaneKind } from "./lane-kind.js";
import type { Outcome } from "../outcome/outcome.js";
import { coveredOutcome } from "./covered-outcome.js";
import { emptyOutcome } from "./empty-outcome.js";

// The frog's fate on terrain `kind`, depending on whether a hazard covers it.
export const outcome = (kind: LaneKind, covered: boolean): Outcome =>
  covered ? coveredOutcome[kind] : emptyOutcome[kind];
