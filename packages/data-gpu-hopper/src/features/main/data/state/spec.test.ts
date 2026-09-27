// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";

// The single pure-spec test for every transform in this folder. It runs the
// manifest's inert cases against the pure functions, asserting `after` (up to an
// id-bijection). The hazard bag is a `ReadonlyMap`, so the comparator matches it
// order-independently.
Conformance.checkSpec(spec);
