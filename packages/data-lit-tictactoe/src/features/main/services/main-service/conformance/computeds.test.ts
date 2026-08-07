// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { currentPlayer } from "../computed-database/computed/current-player.js";
import { cases as currentPlayerCases } from "../../../data/state/current-player.js";
import { fromState } from "./from-state.js";
import { toData } from "./to-data.js";

// Each `data/state` derivation's cases run against its same-named ecs computed.
// Built from the `ComputedDatabase` layer so a `withCache` above it cannot serve a
// stale pre-seed value. Only `currentPlayer` is a `state/` derivation (it composes
// board + firstPlayer); the single-`data/board-state` computeds (winner/status/…)
// are covered by their helper's unit test, per the rules.
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
    // `currentPlayer` emits a scalar `PlayerMark`, so the projection is identity.
    conforms("currentPlayer", {
      cases: currentPlayerCases,
      computed: currentPlayer,
      project: (raw) => raw,
    });
  },
});
