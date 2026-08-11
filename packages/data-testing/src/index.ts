// © 2026 Adobe. MIT License. See /LICENSE for details.

// Shared test-only utilities for the spec↔ecs conformance pattern. Two namespaces:
//   Match       — tolerant, matcher-aware value comparison (framework-agnostic).
//   Conformance — the case types, effect recording, id resolution, and the
//                 spec/transaction/action/computed runner drivers.
// Import only from `*.test.ts`; `sideEffects: false` keeps it out of app builds.
export * as Match from "./match/public.js";
export * as Conformance from "./conformance/public.js";
