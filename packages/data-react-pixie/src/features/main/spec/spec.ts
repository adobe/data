// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";

import { cases as createSprite } from "./create-sprite.cases.js";
import { cases as setSpriteHovered } from "./set-sprite-hovered.cases.js";
import { cases as setSpriteActive } from "./set-sprite-active.cases.js";
import { cases as toggleSpriteActive } from "./toggle-sprite-active.cases.js";
import { cases as tick } from "./tick.cases.js";
import { cases as setFilter } from "./set-filter.cases.js";

// The feature's spec: every action, one inert cases module each (coverage checked at
// compile time against `transforms`). State holds no entity references and the
// actions inject no services, so `schemas` and `services` are omitted.
// `ecs/conformance/` pairs this with the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: {
    createSprite,
    setSpriteHovered,
    setSpriteActive,
    toggleSpriteActive,
    tick,
    setFilter,
  },
});
