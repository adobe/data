// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
import { transitions } from "./transitions.js";

// The single pure-spec test for every transform AND derivation in this folder.
// `runSpec` auto-discovers each module in `transitions` that exports `cases`,
// requires it to export exactly its function plus `cases`, and dispatches on case
// shape. Presence cases carry a full `before`, so no `state` default is passed.
// Cursor positions are `Vec2` tuples compared in order; `cursors` compares by key.
Conformance.runSpec({ transitions });
