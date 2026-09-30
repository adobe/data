// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { GameService } from "../../services/game-service/game-service.js";
import { projection } from "./projection.js";

// The spec paired with its ECS build: each transition against its same-named
// `MainService` action. `game` is injected by the app, so the fake stands in.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  services: { game: GameService.createFake },
});
