// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build. `createInitial`, `fireBullet` and
// `spawnRandomWave` conform against same-named actions; `step` against one driven
// frame of the systems, with the case's `dt` and `input` seeded into the resources
// the systems read.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  frame: {
    op: "step",
    setup: (db, { dt, input }) => {
      db.store.resources.frameDelta = dt;
      db.store.resources.input = input;
    },
  },
});
