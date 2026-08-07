// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { ConcurrencyStrategyFactory } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import { movePresence } from "../action-database/actions/move-presence.js";
import { cases as movePresenceCases } from "../../../data/state/move-presence.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// `movePresence`'s peer identity is the transaction `userId` (the peer's assigned
// mark). A live game database stamps it via its concurrency strategy at db
// construction — before the shared `runActions` driver knows the case, and the
// mark travels as plain action input (never a service) so `makeDb` cannot see it.
// So a test-only concurrency reads the peer id from a closure the `run` adapter
// primes immediately before dispatch; otherwise it commits immediately, like
// `createImmediateConcurrency`. This reproduces the old runner's per-case
// `createRebaseReplayConcurrency(mark)` db through the generic driver.
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

// The registered set the coverage guard checks: only the transition-backed
// `movePresence` action. The UI-facing streaming `trackPresence` action (the sole
// member of the `actions` barrel) has no pure-transition analogue and is not
// conformed here, so the barrel is not the registered set.
Conformance.runActions({
  makeDb: () =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, { concurrency: peerConcurrency }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: { movePresence },
  define: (conforms) => {
    conforms("movePresence", {
      cases: movePresenceCases,
      run: (db, input) => {
        peerUserId = input.mark;
        return movePresence(db, { x: input.x ?? 0, y: input.y ?? 0 });
      },
    });
  },
});
