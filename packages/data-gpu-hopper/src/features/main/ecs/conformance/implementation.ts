// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";
import { cases } from "./frame.cases.js";

// The spec paired with its ECS build: `hop` and `newGame` conform against the
// same-named actions, `movement` and `collision` against the same-named systems. A
// frame's `dt` reaches the systems as `frameDelta`, and the whole-frame cases run the
// systems in schedule order. `MainService.plugin` is headless (the render plugin's
// systems are layered on in the UI), so every system is modelled.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  frame: {
    args: {
      dt: (db, dt) => {
        db.store.resources.frameDelta = dt;
      },
    },
    cases,
  },
});
