// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";

// The pure-spec test for every transform in this folder — runs the manifest's inert
// cases against the pure functions. Presence cursor positions are `Vec2` tuples
// (compared in order); `cursors` compares by key.
Conformance.checkSpec(spec);
