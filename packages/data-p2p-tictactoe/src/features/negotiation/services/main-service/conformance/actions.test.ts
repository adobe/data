// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs action, conformed by name against its transition. The per-transition
// actions live beside the barrel but aren't registered in the facet (that would
// grow the plugin type past tsc's budget), so we discover them by globbing the
// actions directory; the capability-orchestration verbs (configure/startHost/…)
// have no transition and are skipped. Negotiation injects no services.
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
  actions: import.meta.glob(
    ["../action-database/actions/*.ts", "!../action-database/actions/index.ts"],
    { eager: true },
  ),
});
