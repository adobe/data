// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { create } from "./create.js";

// A "new game" TRANSITION: it deliberately **ignores** the prior `state` and
// produces the initial game (see `create`), which is exactly what the ecs
// `newGame` transaction it maps to does (it clears whatever was there). The prior
// state is still the first parameter so it fits the `(state, args) => state` shape
// the co-located conformance cases derive from.
export const newGame = (_state: State): State => create();
