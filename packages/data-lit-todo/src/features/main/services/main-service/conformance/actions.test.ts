// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import type { AnalyticsService } from "../../analytics-service/analytics-service.js";
import type { NameGeneratorService } from "../../name-generator-service/name-generator-service.js";
import { MainService } from "../main-service.js";
import * as actions from "../action-database/actions/index.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs action, conformed by name against its transition. The case's injected
// services become recording overrides via `makeDb`; the runner splits them out,
// resolves `entity()` arg markers, runs the action, and asserts state + effects.
Conformance.runActions({
  // Runtime invariant: the recording wrappers preserve each service's shape.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as {
          analytics?: AnalyticsService;
          nameGenerator?: NameGeneratorService;
        },
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
  initial: State.create(),
});
