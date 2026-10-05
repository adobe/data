// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { implementation } from "./implementation.js";

// Replays every spec case against the same-named action or system, every frame case
// against one real frame, and round-trips `State.samples` through the projection.
Conformance.checkFeature(implementation);
