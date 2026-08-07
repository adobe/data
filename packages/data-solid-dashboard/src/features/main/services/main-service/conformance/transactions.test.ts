// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs transaction, conformed by name against its `data/state` transition —
// no per-item wiring. `runTransactions` discovers the transitions (the glob),
// pairs each registered transaction to the same-named one, seeds `fromState`,
// applies, and compares `toState`. This feature holds only scalar resources, so
// nothing is id-addressed and no `entity()` markers are needed.
Conformance.runTransactions({
  createStore,
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
  transactions,
});
