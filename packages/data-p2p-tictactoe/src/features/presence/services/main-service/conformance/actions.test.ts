// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Database } from "@adobe/data/ecs";
import type { ConcurrencyStrategyFactory } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// `movePresence`'s peer identity is the transaction `userId`, stamped by the db's
// concurrency at dispatch. A test-only concurrency reads it from a closure that
// `seedContext` primes with the case's `mark` just before the action runs; it
// otherwise commits immediately. This is the one residual seam (user-scoped
// context). The per-transition `movePresence` action isn't in the facet barrel
// (the UI streams via `trackPresence`), so it's discovered via the actions glob.
let peerUserId: string | undefined;
const peerConcurrency: ConcurrencyStrategyFactory = (
  execute,
  getTransaction,
) => ({
  deferredCommit: false,
  apply: (envelope) => {
    if (envelope.time === 0) return undefined;
    const transaction = getTransaction(envelope.name);
    if (!transaction) throw new Error(`Unknown transaction: ${envelope.name}`);
    return execute((t) => transaction(t, envelope.args), {
      intermediate: envelope.time < 0,
      userId: peerUserId,
    });
  },
  cancel: () => {},
  onReset: () => {},
});

Conformance.runActions({
  makeDb: () =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, { concurrency: peerConcurrency }),
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
  seedContext: (_db, _before, args) => {
    peerUserId = (args as { mark: string }).mark;
  },
});
