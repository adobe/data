// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs transaction, conformed by name against its `data/state` transition —
// no per-item wiring. Entity-addressed transitions carry a `Conformance.entity`
// marker in their case args, which the runner resolves via the `fromState` id map.
// `dragTodo` has no same-named transition (the drag UI transaction) and is skipped;
// `reorderTodo` is conformed through its action.
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
