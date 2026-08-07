// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling exporting `cases`, requires it to export
// exactly its function plus `cases`, and dispatches on case shape. Presence cases
// carry a full `before`, so no `state` default is passed. Cursor positions are
// `Vec2` tuples compared in order; the `cursors` map compares by key set.
Conformance.runSpec({
  transitions: import.meta.glob<Record<string, unknown>>(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    {
      eager: true,
    },
  ),
});
