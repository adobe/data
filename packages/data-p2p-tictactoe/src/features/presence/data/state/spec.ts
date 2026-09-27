// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";
import { cases as movePresence } from "./move-presence.cases.js";

// The presence conformance manifest. No services (the peer `mark` is ambient `userId`,
// not an injected service), no derivations (no `computedPlugin`/`hydrate`). The pure
// side runs through `checkSpec`; the ecs side needs per-surface `seedContext` + a custom
// concurrency, so it drives the lower runners via `Conformance.adaptCases(spec, …)`
// (see the conformance/ escape-hatch tests) rather than `checkFeature`.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
  cases: { movePresence },
});
