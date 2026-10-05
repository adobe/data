// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { ComputedDatabase } from "../computed/computed-database.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build: actions from `MainService`, computeds from the
// `ComputedDatabase` layer, and the projection between the store and `State`.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
});
