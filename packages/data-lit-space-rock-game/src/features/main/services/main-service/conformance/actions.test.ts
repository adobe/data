// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import type { RandomService } from "../../random-service/random-service.js";
import { MainService } from "../main-service.js";
import * as actions from "../action-database/actions/index.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs action, conformed by name against its transition. `runActions`
// discovers transitions, turns each case's injected services into recording
// overrides via `makeDb`, runs the action, and asserts state + declared effects.
// Auto-pairs `fireBullet` and `spawnRandomWave`. Entity bags compare as
// multisets via the `match` option.
Conformance.runActions({
  // Runtime invariant: the recording wrappers preserve the service's shape, so
  // they are a valid factory override.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as { random?: RandomService },
      }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  transitions: import.meta.glob(
    [
      "../../../data/state/*.ts",
      "!../../../data/state/*.test.ts",
      "!../../../data/state/*.type-test.ts",
    ],
    { eager: true },
  ),
  actions,
  match: { unordered: new Set(["bullets", "asteroids"]) },
});
