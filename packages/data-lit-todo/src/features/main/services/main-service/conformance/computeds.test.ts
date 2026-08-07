// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { visibleTodos } from "../computed-database/computed/visible-todos.js";
import { cases as visibleTodosCases } from "../../../data/state/visible-todos.js";
import { fromState } from "./from-state.js";
import { toData } from "./to-data.js";

// Each derivation's cases run against its same-named ecs computed. `runComputeds`
// seeds the store from the case `input`, reads the computed's synchronous
// emission, hydrates an entity-id list through `toData` (so an id-based computed
// like `visibleTodos` needs no adapter), and matches the derivation's `value`.
// Built from the `ComputedDatabase` layer (not the assembled db) so a `withCache`
// above it cannot serve a stale pre-seed value. Coverage is keyed off the
// `data/state/` derivation modules — every one must be wired.
Conformance.runComputeds({
  makeDb: () =>
    Database.toSystemDatabase(Database.create(ComputedDatabase.plugin)),
  store: (db) => db.store,
  fromState,
  toData,
  derivationModules: import.meta.glob<Record<string, unknown>>(
    [
      "../../../data/state/*.ts",
      "!../../../data/state/*.test.ts",
      "!../../../data/state/*.type-test.ts",
    ],
    { eager: true },
  ),
  define: (conforms) => {
    conforms("visibleTodos", {
      cases: visibleTodosCases,
      computed: visibleTodos,
    });
  },
});
