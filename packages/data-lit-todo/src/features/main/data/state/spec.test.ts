// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "./spec.js";

// The single pure-spec test for every transform AND derivation in this folder. It
// runs the manifest's inert cases against the pure functions, synthesizing each
// injected service's recording double from the `services` templates + the case's
// `responses`, and asserting `after` (up to an id-bijection) and declared `effects`.
Conformance.checkSpec(spec);
