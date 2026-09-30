// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build: `hop` and `newGame` conform against the
// same-named actions; `step` is realized by the systems, so each case drives one
// headless frame of `frameDelta = dt`.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  frame: {
    op: "step",
    setup: (db, { dt }) => {
      db.store.resources.frameDelta = dt;
    },
  },
});
