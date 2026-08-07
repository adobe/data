// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
import { State } from "./state.js";
import { transitions } from "./transitions.js";

// The single pure-spec test for every transform AND derivation. Each case's
// `before`/`input` is a delta over `State.create()`.
Conformance.runSpec({ state: State, transitions });
