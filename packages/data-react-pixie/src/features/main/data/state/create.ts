// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The default scene state: no filter, no entities. It is the baseline the
// conformance cases author their `before` as deltas over, and the state a fresh
// scene starts in.
export const create = (): State => ({ filter: "none", entities: new Map() });
