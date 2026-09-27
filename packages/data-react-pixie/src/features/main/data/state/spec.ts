// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";

import { cases as createSprite } from "./create-sprite.cases.js";
import { cases as setSpriteHovered } from "./set-sprite-hovered.cases.js";
import { cases as setSpriteActive } from "./set-sprite-active.cases.js";
import { cases as toggleSpriteActive } from "./toggle-sprite-active.cases.js";
import { cases as tick } from "./tick.cases.js";
import { cases as setFilter } from "./set-filter.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. It wires each conformed fn to its inert cases module explicitly: `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms` (a fn without cases, or cases without
// a fn, won't type). This feature has no capability services and no derivations, so
// `services`, `computedPlugin`, and `hydrate` are all omitted.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
  cases: {
    createSprite,
    setSpriteHovered,
    setSpriteActive,
    toggleSpriteActive,
    tick,
    setFilter,
  },
});
