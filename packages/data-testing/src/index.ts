// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared test-only utilities for the spec↔ecs conformance pattern. Two namespaces:
//   Match       — tolerant, matcher-aware value comparison (framework-agnostic).
//   Conformance — the case types, effect recording, id resolution, and the
//                 spec/transaction/action/computed runner drivers.
// Import only from `*.test.ts`; `sideEffects: false` keeps it out of app builds.
export * as Match from "./match/public.js";
export * as Conformance from "./conformance/public.js";

// The conformance case TYPES, also re-exported top-level (compile-time only, so the
// `Conformance` namespace API is unchanged). A `Conformance.cases(...)` result flows
// into a downstream package's emitted `.d.ts` as one of these types; TS cannot name a
// type reached only through an `export * as` namespace, so without a top-level path it
// falls back to the deep `dist/…` file path — which is not a package export, and the
// consumer's build fails with TS2883. Naming them here makes that reference portable.
export type {
  Case,
  Cases,
  CasesResult,
  DerivationCase,
  DerivationCases,
  DerivationsResult,
  Effects,
  ServiceCall,
} from "./conformance/public.js";
