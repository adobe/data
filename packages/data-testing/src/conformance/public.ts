// © 2026 Adobe. MIT License. See /LICENSE for details.
export type { Case, Cases, DerivationCase, DerivationCases, Effects, ServiceCall } from "./types.js";
export {
  casesBuilder,
  derivationsBuilder,
  type CasesBuilder,
  type CasesResult,
  type DerivationsBuilder,
  type DerivationsResult,
} from "./cases.js";
export { runSpec, type SpecRunConfig } from "./run-spec.js";
export { runTransactions, type TransactionRunConfig } from "./run-transactions.js";
export { runActions, type ActionRunConfig } from "./run-actions.js";
export { runComputeds, type ComputedRunConfig } from "./run-computeds.js";
export { runFeature, type FeatureRunConfig, type Projection } from "./run-feature.js";
// For custom conformance harnesses (e.g. an ECS-system frame): compare two States
// up to an id-bijection, the same way the runners do.
export { assertState } from "./assert-state.js";
// For custom conformance harnesses: assert a call throws, the same way a case's
// `throws` field does in the built-in runners.
export { expectThrows } from "./expect-throws.js";
export type { SchemaSource } from "./refify.js";
