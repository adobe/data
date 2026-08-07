// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling that exports `cases`, requires exactly its
// function plus `cases`, and dispatches on case shape (a `value` case is a
// derivation, otherwise a transition). Tic-tac-toe's `State` is scalar (a board
// string + counters, no arrays or minted ids), so the default comparison applies.
Conformance.runSpec(
  import.meta.glob<Record<string, unknown>>(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    {
      eager: true,
    },
  ),
);
