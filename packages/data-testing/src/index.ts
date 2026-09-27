// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared test-only utilities for the spec↔ecs conformance pattern. Two namespaces:
//   Match       — tolerant, matcher-aware value comparison (framework-agnostic).
//   Conformance — the manifest API (`feature` / `checkSpec` / `checkFeature`), the case
//                 types, and the lower-level runner escape hatch.
// Import only from a feature's test tier (its `*.cases.ts`, `spec.ts`, `*.fake.ts`, and
// `*.test.ts`), which the package's project-reference wall keeps out of the runtime build.
export * as Match from "./match/public.js";
export * as Conformance from "./conformance/public.js";

// The conformance case TYPES, also re-exported top-level (compile-time only). A
// `Conformance.SpecCases<…>` result flows into a downstream package's emitted `.d.ts` as
// one of these types; TS cannot name a type reached only through an `export * as`
// namespace, so without a top-level path it falls back to the deep `dist/…` file path —
// which is not a package export, and the consumer's build fails with TS2883. Naming them
// here makes that reference portable.
export type {
  SpecCase,
  SpecCases,
  SpecDerivationCase,
  SpecDerivations,
  Responses,
  CaseModule,
  FeatureSpec,
  Effects,
  ServiceCall,
} from "./conformance/public.js";
