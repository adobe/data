// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { components } from "../data/components/index.js";
import { resources } from "../data/resources/index.js";
import { RandomService } from "../services/random-service/random-service.js";

import { cases as createInitial } from "./create-initial.cases.js";
import { cases as fireBullet } from "./fire-bullet.cases.js";
import { cases as spawnRandomWave } from "./spawn-random-wave.cases.js";
import { cases as step } from "./step.cases.js";

// The feature's spec: every transition, one inert cases module each (coverage checked
// at compile time against `transforms`). `schemas` supplies the column precision the
// comparator reads; `services` is the fake template the runner builds `random`
// recording doubles from. `ecs/conformance/` pairs this with the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },
  services: { random: RandomService.createFake },
  cases: {
    createInitial,
    fireBullet,
    spawnRandomWave,
    step,
  },
});
