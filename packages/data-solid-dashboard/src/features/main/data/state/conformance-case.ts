// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance as ConformanceApi } from "@adobe/data-testing";
import type { State } from "./state.js";

// The conformance case types for this feature — the shared `@adobe/data-testing`
// machinery with `State` bound once, so a transform authors `Conformance<typeof fn>`
// and a derivation `Derivation<typeof fn>` (args/input/value read from the
// function's own signature). This tiny file is the only per-feature conformance
// type declaration; everything else lives in `@adobe/data-testing`.
export type Conformance<F extends (...args: never[]) => unknown> =
  ConformanceApi.Cases<State, F>;
export type Derivation<F extends (...args: never[]) => unknown> =
  ConformanceApi.DerivationCases<F>;
