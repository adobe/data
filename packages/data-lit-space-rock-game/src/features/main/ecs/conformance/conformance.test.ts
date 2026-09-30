// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { implementation } from "./implementation.js";

// Replays every spec case against the same-named action (or, for `step`, one driven
// frame of the systems), and round-trips `State.samples` through the projection.
Conformance.checkFeature(implementation);
