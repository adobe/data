// © 2026 Adobe. MIT License. See /LICENSE for details.
// An action that reads ambient context the spec can't carry (the acting peer's
// `userId`) conforms through `checkFeature`: `seedContext` primes a test concurrency
// that stamps the `userId` at dispatch.
import { Database } from "@adobe/data/ecs";
import type { ConcurrencyStrategyFactory } from "@adobe/data/ecs";
import { spec } from "./spec.js";
import { implementation } from "./implementation.js";
import { checkFeature } from "./check-feature.js";
import type { SpecCases } from "./feature-types.js";

type State = { readonly lastMover: string };

const move = (_state: State, { peer }: { readonly peer: string }): State => ({ lastMover: peer });

const plugin = Database.Plugin.create({
  resources: { lastMover: { default: "" as string } },
  transactions: {
    move: (t) => {
      t.resources.lastMover = String(t.userId ?? "");
    },
  },
  actions: {
    move: (db, _args: { readonly peer: string }) => {
      db.transactions.move();
    },
  },
});
type Store = Database.Plugin.ToStore<typeof plugin>;

let peer: string | undefined;
const peerConcurrency: ConcurrencyStrategyFactory = (execute, getTransaction) => ({
  deferredCommit: false,
  apply: (envelope) => {
    if (envelope.time === 0) return undefined;
    const transaction = getTransaction(envelope.name);
    if (!transaction) throw new Error(`Unknown transaction: ${envelope.name}`);
    return execute((t) => transaction(t, envelope.args), { intermediate: envelope.time < 0, userId: peer });
  },
  cancel: () => {},
  onReset: () => {},
});

const cases: SpecCases<State, typeof move> = {
  cases: [
    { name: "records the acting peer", before: {}, args: { peer: "X" }, after: { lastMover: "X" } },
    { name: "records another peer", before: { lastMover: "X" }, args: { peer: "O" }, after: { lastMover: "O" } },
  ],
};

checkFeature(
  implementation(spec({ state: { create: (): State => ({ lastMover: "" }) }, fns: { move }, cases: { move: cases } }), {
    plugin,
    projection: {
      fromState: (store: Store, state: State): void => {
        store.resources.lastMover = state.lastMover;
      },
      toState: (store: Store): State => ({ lastMover: store.resources.lastMover }),
    },
    concurrency: peerConcurrency,
    seedContext: (_db, _before, args) => {
      // Runtime invariant: every `move` case's args carry its `peer`.
      peer = (args as { readonly peer: string }).peer;
    },
  }),
);
