# @adobe/data-persistence

Worker-based incremental persistence for `@adobe/data` ECS databases.

This package is **purely additive** — it does not replace `db.toData()` /
`db.fromData()`, which remain the canonical whole-world snapshot mechanism
and continue to back `createStoragePersistenceService` in `@adobe/data`.
Use this package when worlds are large enough that re-serializing the
entire database on every save is prohibitive.

## Status

Functionally complete. Crash-recovery and journal-replay are tested across both runtimes; see the Crash safety section below for the precise contract and the Performance section for benchmarked baselines.

## Design

- **O(1) byte-range writes** to per-archetype × column files
- **Append-only journal** for changes between checkpoints (true
  write-ahead log: each tx is closed by a `commit` entry; replay only
  applies entries belonging to a tx whose commit reached disk)
- Runs in a **dedicated worker** (browser OPFS via
  `FileSystemSyncAccessHandle`, or Node `worker_threads` over `node:fs`)
- Single core implementation; only the `RandomAccessFile`,
  `PersistenceBackend`, and `Transport` factories differ per runtime

## Crash safety

What we guarantee:

- Clean shutdown via `dispose()` → next `load()` is byte-identical.
- Crash between transactions → next `load()` is the last fully-committed
  transaction. Snapshot + journal replay reconstructs the world.
- Crash inside the journal stream itself (torn append) → the affected
  entry is dropped; everything before it is recovered.
- Crash with the commit marker missing for a tx → replay drops every
  entry of that tx, so it never half-applies a multi-entity transaction.

What we do **not** guarantee:

- Row-level rollback of an in-flight transaction. Column-slice writes
  are eager, so if a crash happens *during* a tx's writes, individual
  column files may already reflect bytes from the dropped tx. Replay
  refuses to extend the dropped tx into other entities, but bytes
  written to its own row may persist.

Full row-level atomicity would require shadow paging or a separate
undo log, both of which trade away the O(1) write property this
package is designed for.

## Public entry points

| Import path | Use from |
|---|---|
| `@adobe/data-persistence` | runtime-agnostic surface (interfaces, in-memory backend, encoder, service factory) |
| `@adobe/data-persistence/browser` | OPFS backend + browser worker transport |
| `@adobe/data-persistence/node` | `node:fs` backend + `node:worker_threads` transport |

## Performance

Two complementary guarantees:

### Algorithmic complexity (O(changes))

The cost of persisting a transaction T is **O(touched_columns + changed_entities)** — independent of total world size, archetype row capacity, or the number of registered archetypes. Verified by `src/service/persistence-complexity.test.ts`, which counts `PersistOp` messages emitted per transaction across worlds of N=100, 1k, and 10k entities and asserts the count is identical:

| Transaction shape | Ops emitted (any N) |
|---|---|
| Update 1 component on 1 entity | 4 (journal entry + column slice + ELT + commit) |
| Update 3 components on 1 entity | 8 |
| Insert (3-column archetype) | 8 |
| Delete + 1 swap-remove side effect | 10 |

The only operation that scales with the world is `checkpoint()`, and it scales with archetype × column count (manifest schema), not row count.

### Wall-clock baseline

Run with:

```bash
pnpm --filter @adobe/data-persistence run perf
```

Numbers below are from a steady-state run on an in-process transport (no worker postMessage overhead), 1000-entity world, three-component archetype:

| Scenario | μs/op (mean) | μs/op (p99) | ops/sec |
|---|---:|---:|---:|
| tx: update 1 component on 1 entity | ~160 | ~250 | ~6,200 |
| tx: update 3 components on 1 entity | ~350 | ~490 | ~2,850 |
| tx: insert (3 columns) | ~350 | ~480 | ~2,900 |
| tx: delete + swap-remove side effect | ~470 | ~620 | ~2,100 |
| checkpoint after 1000 dirty rows | ~140 | ~350 | ~7,000 |
| load 1000-entity snapshot | ~58 | ~125 | ~17,000 |

Read these as comparative ratios, not absolute targets — the 2.2× ratio between 1-column and 3-column updates confirms the per-component-write optimization is doing useful work, and the flat checkpoint cost (~140 μs regardless of how many rows were dirtied) confirms the "column writes happen incrementally, checkpoint is just manifest + journal truncate" design property.

Worker-thread transports (browser OPFS, Node `worker_threads`) add 1–10 μs of `postMessage` round-trip per op on top of these numbers, plus real disk I/O at checkpoint and load.
