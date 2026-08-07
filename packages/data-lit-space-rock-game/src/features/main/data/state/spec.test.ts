// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each sibling exporting `cases` and dispatches on shape.
// The entity bags (`bullets`, `asteroids`) the ecs materialises in nondeterministic
// row order compare as multisets; ordered `Vec2`s and scalars compare in order.
Conformance.runSpec(
  import.meta.glob<Record<string, unknown>>(
    ["./*.ts", "!./*.test.ts", "!./*.type-test.ts"],
    {
      eager: true,
    },
  ),
  { match: { unordered: new Set(["bullets", "asteroids"]) } },
);
