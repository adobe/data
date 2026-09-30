// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import * as systems from "./systems.js";
import { components } from "../data/components/index.js";
import { resources } from "../data/resources/index.js";
import { RandomService } from "../services/random-service/random-service.js";

import { cases as createInitial } from "./create-initial.cases.js";
import { cases as fireBullet } from "./fire-bullet.cases.js";
import { cases as spawnRandomWave } from "./spawn-random-wave.cases.js";
import { cases as control } from "./control.cases.js";
import { cases as movement } from "./movement.cases.js";
import { cases as lifetime } from "./lifetime.cases.js";
import { cases as collision } from "./collision.cases.js";
import { cases as waves } from "./waves.cases.js";
import { cases as frame } from "./frame.cases.js";

// The feature's spec: every transition and every ECS system, one inert cases module
// each (coverage checked at compile time), plus whole-frame cases. `schemas` supplies
// the column precision the comparator reads; `services` is the fake template the
// runner builds `random` recording doubles from. `ecs/conformance/` pairs this with
// the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },
  services: { random: RandomService.createFake },
  cases: {
    createInitial,
    fireBullet,
    spawnRandomWave,
  },
  systems: {
    fns: systems,
    cases: { control, movement, lifetime, collision, waves },
    frame,
  },
});
