// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";
import { cases as frame } from "./frame.cases.js";

// The spec paired with its ECS build. `createInitial`, `fireBullet` and
// `spawnRandomWave` conform against same-named actions; each spec system against its
// same-named ECS system, with a case's `dt` and `input` written into the resources
// the systems read. Every system is modelled; `frame` replays whole frames in
// schedule order.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  frame: {
    args: {
      dt: (db, dt) => {
        db.store.resources.frameDelta = dt;
      },
      input: (db, input) => {
        db.store.resources.input = input;
      },
    },
    cases: frame,
  },
});
