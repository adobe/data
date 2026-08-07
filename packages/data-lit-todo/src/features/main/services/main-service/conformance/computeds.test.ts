// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import * as computeds from "../computed-database/computed/index.js";
import { fromState } from "./from-state.js";
import { toData } from "./to-data.js";

// Every ecs computed backing a `data/state` derivation, conformed by name, built
// from the ComputedDatabase layer. `visibleTodos` emits entity ids, so it is named
// in `hydrate` to project each through `toData` into the `Todo[]` the derivation
// yields; scalar/value computeds compare directly.
Conformance.runComputeds({
  makeDb: () =>
    Database.toSystemDatabase(Database.create(ComputedDatabase.plugin)),
  store: (db) => db.store,
  fromState,
  toData,
  derivations: import.meta.glob(
    [
      "../../../data/state/*.ts",
      "!../../../data/state/*.test.ts",
      "!../../../data/state/*.type-test.ts",
    ],
    { eager: true },
  ),
  computeds,
  hydrate: ["visibleTodos"],
  initial: State.create(),
});
