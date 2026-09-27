// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../../data/state/spec.js";

// The whole ecs conformance for this feature in one call: `checkFeature` replays the
// manifest's shared cases against the transactions on `MainService.plugin` and the
// per-transition actions supplied via `spec.ops.actions`, seeds each case's `before`
// over `State.create()`, and round-trips `State.samples` through the projection. It
// shares `spec` with `spec.test.ts` — same cases, substituted implementation.
Conformance.checkFeature(spec);
