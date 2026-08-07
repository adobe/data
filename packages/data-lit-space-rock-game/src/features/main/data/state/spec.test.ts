// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import { State } from "./state.js";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling exporting `cases`, requires it to export
// exactly its function plus `cases`, and dispatches on case shape. Each case's
// `before`/`input` is a delta over `State.create()`.
Conformance.runSpec({
  state: State,
  transitions: import.meta.glob(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    { eager: true },
  ),
  match: { unordered: new Set(["bullets", "asteroids"]) },
});
