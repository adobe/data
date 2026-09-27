// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";

// The single pure-spec test for every transform in this folder — runs the manifest's
// inert cases against the pure functions, seeding each case's `before` over
// `State.create()` and asserting the `after` writes patch.
Conformance.checkSpec(spec);
