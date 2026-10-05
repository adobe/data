// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build: `movePresence` against the same-named action.
// `conformance.test.ts` runs it through the lower-level runners, because the action
// needs the peer `userId` seeded per case.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
});
