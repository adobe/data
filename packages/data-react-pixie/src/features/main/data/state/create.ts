// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The default scene state: no sprites, no filter. It is the baseline the
// conformance cases author their `before` as deltas over, and the state a fresh
// scene starts in.
export const create = (): State => ({ sprites: [], filter: "none" });
