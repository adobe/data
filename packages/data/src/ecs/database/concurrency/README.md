# Concurrency strategies

A `ConcurrencyStrategy` owns how a transaction mutates the store: when a local
edit applies, whether it waits for a server echo, and how inbound/echoed
envelopes are reconciled against in-flight local state. It is the single seam
through which the database's *consistency model* is swapped — everything else
(transaction wrapping, observers, indexes, the typed public surface) is built by
the library around whatever strategy you supply.

```ts
const db = createDatabase(plugin, { concurrency: createRebaseReplayConcurrency(userId) });
```

Omitting `concurrency` selects `createImmediateConcurrency()`.

## The contract

```ts
type ConcurrencyStrategyFactory = (
  execute:        (fn, opts?: { transient?: boolean; userId?: Id }) => TransactionResult,
  getTransaction: (name: string) => TransactionFn | undefined,
) => ConcurrencyStrategy;

interface ConcurrencyStrategy {
  deferredCommit: boolean;          // read ONCE at construction by the dispatcher
  userId?: number | string;         // stamped on outbound envelopes; surfaced as db.concurrency.userId
  apply(envelope): TransactionResult | undefined;
  cancel(id, userId?): void;
  onReset(): void;
  onBeforeToData?(): void;          // see "Serialization"
  onAfterToData?(): void;
  onAfterFromData?(): void;
}
```

The factory is invoked once during construction. You get two type-erased
capabilities below the public API:

- **`execute(fn, opts)`** runs `fn(ctx)` as one atomic transaction, fires
  observers, and returns a `TransactionResult` whose `redo`/`undo` are the
  post-image / inverse data tuples. `opts.transient` only tags the result as
  intermediate; it does *not* change durability. `opts.userId` is threaded into
  `ctx.userId`.
- **`getTransaction(name)`** resolves a registered transaction function. It is
  **lazy** — names are registered by `extend()` *after* the strategy is built,
  so resolve at call time, never cache at construction.

### Envelopes

`apply` is the one entry point for both locally-initiated transactions (from the
dispatcher) and inbound ones (`db.apply` from a sync service). The `time` sign is
the discriminator:

| `time` | meaning        |
|--------|----------------|
| `< 0`  | transient (optimistic / intermediate) |
| `> 0`  | committed (authoritative) |
| `= 0`  | cancel the `(userId, id)` entry |

`deferredCommit` decides how the dispatcher emits a user's `commit` intent: when
`true`, commits are applied locally as transients (`time < 0`) and you promote
them when the authoritative echo (`time > 0`) arrives; when `false`, commits
apply immediately (`time > 0`). The `(userId, id)` pair is the compound identity
of an in-flight entry across peers.

## Writing one

```ts
export const createMyConcurrency = (userId): ConcurrencyStrategyFactory =>
  (execute, getTransaction) => {
    const run = (env) => {
      const fn = getTransaction(env.name);
      if (!fn) throw new Error(`Unknown transaction: ${env.name}`);
      return execute(t => fn(t, env.args), { transient: env.time < 0, userId: env.userId });
    };
    return {
      deferredCommit: true,
      userId,
      apply(env) { /* your reconciliation; call run(env) / replay tuples */ },
      cancel(id, uid) { /* roll back the (uid,id) entry */ },
      onReset() { /* drop any pending buffer */ },
    };
  };
```

The two built-ins are the reference implementations and bracket the design space:

- **`immediate`** — no pending buffer, commits land directly. Per-transaction
  transient rollback only (for async-generator yields). Use as the base for an
  external wrapper that runs its own reconciliation.
- **`rebase-replay`** — re-executes pending transactions on rebase (intent
  preserving). Shares `createRebaseReplayApplier`.
- **`roll-forward`** — replays pending edits by re-applying captured post-image
  tuples (`applyOperations(t, entry.redo)`), not by re-running their functions
  (deterministic w.r.t. base drift). A client-side collaborative-editing model;
  present mainly to prove the seam.

## Invariants — read before implementing

1. **Roll back in reverse stack order, never mid-stack.** Entity-id allocation
   draws from a freelist. Undoing a non-top entry while lower entries are still
   applied corrupts the freelist. The rebase shape is always: roll back *all*
   transients newest→oldest → apply the committed envelope → replay survivors
   oldest→newest.

2. **Cross-peer id determinism requires the rebase.** Applying a committed
   envelope on a clean (fully rolled-back) base guarantees every peer takes the
   same freelist/`nextIndex` snapshot at that point, so allocations converge.
   Apply a commit *on top of* pending transients and ids diverge across peers.
   `immediate` deliberately forgoes this (single-writer / externally-reconciled).

3. **Do not fire `observe.envelopes`.** The dispatcher owns outbound
   notification, intent tagging, the `nextTransactionId` counter, no-op
   suppression, and `userId` stamping. `apply` is purely the store-mutation side.

4. **`apply` must be a deterministic function of `(store state, envelope)`** for
   any strategy that targets convergence. No wall-clock, no RNG, no peer-local
   ambient state inside the transaction path.

5. **Replay must reproduce identical effects.** Re-execution (rebase-replay) is
   intent-preserving but recomputes against the new base; tuple roll-forward is
   base-invariant but freezes the original post-image. Pick deliberately — they
   diverge exactly when a transaction reads state it also writes.

6. **`deferredCommit` is immutable post-construction.** It is captured once by
   the dispatcher; you cannot flip modes at runtime — build a new database.

## Serialization

`db.toData()` rolls back, serializes, and replays so a snapshot excludes
in-flight transients. The snapshot is otherwise backed by **live** store buffers,
so the replay would corrupt it — therefore, when `onAfterToData` is present, the
database serializes a **detached copy** (`store.toData(true)`, which clones
columns and the entity table) between `onBeforeToData` and `onAfterToData`. If
your strategy keeps a pending buffer:

- `onBeforeToData` → roll all transients back (committed-only state),
- `onAfterToData` → replay them,
- `onAfterFromData` → replay them after a load.

Omit all three if you have no pending state; the database then returns the faster
live-reference snapshot, valid only until the next mutation (serialize it
immediately).

## Notes

- The seam is intentionally type-erased (`any`/`unknown`). Strategies operate
  below the typed `Database` surface; the library reconstructs full generic types
  around your output. Don't try to make the strategy generic.
- `db.concurrency` exposes the live strategy. `data-sync` reads
  `concurrency.deferredCommit` and `concurrency.userId` to confirm a database is
  in a sync-capable mode.
