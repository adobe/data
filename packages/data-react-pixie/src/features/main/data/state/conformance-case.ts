// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance as ConformanceApi } from "@adobe/data-testing";
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

// The entity-reference marker for case args: `args: { id: entity(2) }` names "the
// entity seeded for spec-id 2". The pure spec reads `2`; the ecs runner resolves
// it to the seeded entity. Re-exported here so cases import it beside `Conformance`.
export const entity = ConformanceApi.entity;
