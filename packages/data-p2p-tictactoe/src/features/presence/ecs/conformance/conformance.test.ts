// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { implementation } from "./implementation.js";

// Replays every spec case against the same-named action and round-trips the samples.
Conformance.checkFeature(implementation);
