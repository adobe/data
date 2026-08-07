// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import * as computeds from "../computed-database/computed/index.js";
import { fromState } from "./from-state.js";
import { toData } from "./to-data.js";

// Every ecs computed backing a `data/state` derivation, conformed by name. Only
// `currentPlayer` is a derivation (composes board + firstPlayer); the single-type
// board computeds (winner/status/…) have no derivation and are covered by their
// `data/board-state` helper tests. Built from the ComputedDatabase layer.
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
});
