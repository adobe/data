// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import * as transactions from "../transaction-database/transactions/index.js";
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Every ecs transaction, conformed by name against its `data/state` transition —
// no per-item wiring. Entity-addressed transitions (setSpriteActive /
// setSpriteHovered / toggleSpriteActive) carry a `Conformance.entity` marker in
// their case args, which the runner resolves to the seeded entity via the
// `fromState` id map. createSprite / setFilter / tick are plain-data addressed.
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
