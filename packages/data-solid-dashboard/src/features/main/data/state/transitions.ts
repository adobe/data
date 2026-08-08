// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />

// The transform/derivation modules for conformance discovery — the `{ fn, cases }`
// source shared by `spec.test.ts` (pure) and the ecs `conformance.test.ts`. The
// glob must be authored where Vite can statically see it (an eager glob, excluding
// tests and this file itself); consumers import the resolved map.
export const transitions = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./*.type-test.ts", "!./transitions.ts"],
  { eager: true },
);
