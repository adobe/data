// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { Database, Store } from "@adobe/data/ecs";
import type { ConcurrencyStrategyFactory } from "@adobe/data/ecs";
import { Conformance, Match } from "@adobe/data-testing";
import { MainService } from "../main-service.js";
import { implementation } from "./implementation.js";

// `checkFeature` can't seed the peer identity, so this drives the lower-level
// runners from the same manifest. `movePresence` reads the transaction `userId`,
// which the db's concurrency stamps at dispatch: this test-only concurrency reads it
// from a closure that `seedContext` primes with the case's `mark`, and otherwise
// commits immediately.
const { spec, projection } = implementation;

let peerUserId: string | undefined;
const peerConcurrency: ConcurrencyStrategyFactory = (execute, getTransaction) => ({
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
  makeDb: () => Database.toSystemDatabase(Database.create(MainService.plugin, { concurrency: peerConcurrency })),
  store: (db) => db.store,
  fromState: projection.fromState,
  toState: projection.toState,
  initial: spec.state.create(),
  transitions: Conformance.adaptCases(spec.fns, spec.cases, spec.services, true),
  actions: MainService.plugin.actions,
  seedContext: (_db, _before, args) => {
    // Runtime invariant: presence cases carry a `mark` (see move-presence.cases.ts).
    peerUserId = (args as { mark: string }).mark;
  },
});

describe("projection round-trips (toState ∘ fromState ≡ identity)", () => {
  (spec.state.samples ?? []).forEach((sample, i) => {
    it(`sample ${i}`, () => {
      const store = Store.create(MainService.plugin);
      projection.fromState(store, sample);
      Match.assert(projection.toState(store), sample);
    });
  });
});
