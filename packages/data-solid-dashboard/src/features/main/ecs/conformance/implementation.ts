// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build: actions from `MainService` and the projection
// between the store and `State`. No derivations, so no `computedPlugin`.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
});
