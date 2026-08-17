// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance as ConformanceApi } from "@adobe/data-testing";
import type { State } from "./state.js";

// The per-feature conformance surface — the shared `@adobe/data-testing` machinery
// with `State` bound once. `Conformance.cases(fn, [options,] ...cases)` declares a
// transform's cases (the case types come from `fn`); a derivation authors
// `Derivation<typeof fn>`. This tiny file is the only per-feature conformance
// declaration; everything else lives in `@adobe/data-testing`.
export const Conformance = { cases: ConformanceApi.casesBuilder<State>() };
export type Derivation<F extends (...args: never[]) => unknown> =
  ConformanceApi.DerivationCases<F>;
export type Effects<Args> = ConformanceApi.Effects<Args>;
