// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import { State } from "./state.js";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling that exports `cases`, requires exactly its
// function plus `cases`, and dispatches on case shape (a `value` case is a
// derivation, otherwise a transition). Each case's `before` is a delta over
// `initial` (the default state), so cases carry only what they change.
Conformance.runSpec(
  import.meta.glob<Record<string, unknown>>(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    {
      eager: true,
    },
  ),
  { state: State },
);
