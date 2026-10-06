// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConcurrencyStrategyFactory } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../spec/spec.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// `movePresence` reads the transaction `userId`, which the db's concurrency stamps at
// dispatch. This test-only concurrency reads it from a closure that `seedContext`
// primes with each case's `mark`, and otherwise commits immediately.
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

// The spec paired with its ECS build: `movePresence` against the same-named action,
// with the acting peer seeded per case.
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  projection,
  concurrency: peerConcurrency,
  seedContext: (_db, _before, args) => {
    // Runtime invariant: presence cases carry a `mark` (see move-presence.cases.ts).
    peerUserId = (args as { readonly mark: string }).mark;
  },
});
