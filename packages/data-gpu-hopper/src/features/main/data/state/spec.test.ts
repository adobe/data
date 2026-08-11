// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import { transitions } from "./transitions.js";

// The single pure-spec test for every transform in this folder. `runSpec`
// auto-discovers each module in `transitions` that exports `cases`, requires it to
// export exactly its function plus `cases`, and dispatches on case shape. The
// hazard bag the ecs materialises in nondeterministic row order compares as a
// multiset via `match.unordered`.
Conformance.runSpec({
  state: State,
  transitions,
  match: { unordered: new Set(["hazards"]) },
});
