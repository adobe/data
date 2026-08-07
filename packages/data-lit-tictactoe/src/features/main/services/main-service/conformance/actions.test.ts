// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { MainService } from "../main-service.js";
import * as actions from "../action-database/actions/index.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs action, conformed by name against its transition. No tictactoe
// transition injects a service, so `makeDb` needs no recording service overrides.
Conformance.runActions({
  makeDb: () => Database.toSystemDatabase(Database.create(MainService.plugin)),
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
