// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling that exports `cases`, requires it to
// export exactly its function plus `cases`, and dispatches on case shape (a
// `value` case is a derivation, otherwise a transition whose declared `effects`
// are also asserted). This feature's `State` is entirely scalar (the `log` trail
// is chronological), so the default ordered, matcher-aware comparison is correct.
Conformance.runSpec(
  import.meta.glob<Record<string, unknown>>(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    {
      eager: true,
    },
  ),
);
