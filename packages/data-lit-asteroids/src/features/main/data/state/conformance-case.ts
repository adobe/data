// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// One spec-owned conformance case: a `data/` transform's `{ before, args, after }`
// authored as full `State`. Lives in `<transform>.cases.ts` and is shared,
// unchanged, by the data transform test and the ecs conformance runner
// (see `ecs/conformance/`).
export type ConformanceCase<Args> = {
  readonly name: string;
  readonly before: State;
  readonly args: Args;
  readonly after: State;
};
