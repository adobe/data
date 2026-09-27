// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformance manifest API — the standard surface. `feature` builds a feature's
// manifest; `checkSpec` runs the pure spec suite, `checkFeature` the ecs suite.
export { feature, checkSpec, checkFeature, type FeatureSpec } from "./feature-spec.js";
export type {
  Responses,
  SpecCase,
  SpecCases,
  SpecDerivationCase,
  SpecDerivations,
  CaseModule,
} from "./feature-types.js";
export type { Effects, ServiceCall } from "./types.js";

// The escape hatch — the lower-level runners, for a feature whose ecs conformance needs
// per-surface `seedContext` or a custom concurrency/db (e.g. a user-scoped `userId`); it
// feeds them from its manifest with `adaptCases`. Ordinary features use `checkFeature`.
export { adaptCases } from "./adapt-spec.js";
export { runTransactions, type TransactionRunConfig } from "./run-transactions.js";
export { runActions, type ActionRunConfig } from "./run-actions.js";
export { runComputeds, type ComputedRunConfig } from "./run-computeds.js";
export type { Projection } from "./run-feature.js";

// For custom conformance harnesses: compare two States up to an id-bijection, and assert
// a call throws, the same way the built-in runners do.
export { assertState } from "./assert-state.js";
export { expectThrows } from "./expect-throws.js";
export type { SchemaSource } from "./refify.js";
