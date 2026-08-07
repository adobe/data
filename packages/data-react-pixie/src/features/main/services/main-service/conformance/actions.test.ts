// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import * as actions from "../action-database/actions/index.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs action, conformed by name against its transition. The runner splits
// each case's injected services into recording overrides via `makeDb`, resolves
// `entity()` arg markers to the seeded entity, runs the action, and asserts state
// + declared effects. This feature injects no services, so the override is always
// empty (no cast).
Conformance.runActions({
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, { services }),
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
});
