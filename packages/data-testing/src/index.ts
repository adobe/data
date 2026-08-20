// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared test-only utilities for the spec↔ecs conformance pattern. Two namespaces:
//   Match       — tolerant, matcher-aware value comparison (framework-agnostic).
//   Conformance — the case types, effect recording, id resolution, and the
//                 spec/transaction/action/computed runner drivers.
// Import only from `*.test.ts`. `sideEffects: false` lets a bundler drop an
// unused *import* of this package, but a co-located `Conformance.cases(fn, …)` /
// `Conformance.derivations(fn, …)` call in a transform file is still a plain
// function call — an unannotated call is kept even when its result (the `cases`
// export) is never read. Every call site MUST be written
// `/*@__PURE__*/ Conformance.cases(...)` (see `data/state.md`), or the case
// fixtures — and this package's builder code — ship in the production bundle
// of any app that actually calls the transition. Verified against a Vite/Rollup
// production build: without the annotation the case data is retained; with it,
// gone.
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
