# @adobe/data-persistence

Incremental persistence for `@adobe/data` ECS databases — O(1) writes,
append-only journal, crash recovery.

This package is **purely additive** — it does not replace `db.toData()` /
`db.fromData()`, which remain the canonical whole-world snapshot mechanism.
Use this package when worlds are large enough that re-serializing the
entire database on every save is prohibitive.

## Status

Functionally complete. Crash-recovery and journal-replay are tested across both runtimes; see the Crash safety section below for the precise contract and the Performance section for benchmarked baselines.

## Design

- **O(1) byte-range writes** to per-archetype × column files
- **Append-only journal** for changes between checkpoints (true
  write-ahead log: each tx is closed by a `commit` entry; replay only
  applies entries belonging to a tx whose commit reached disk)
- **Pluggable storage** via `PersistenceProvider` — OPFS, Node `fs`,
  in-memory, or a custom cloud implementation
- Workers are **optional** for Node (libuv is already async); always
  required for OPFS (`FileSystemSyncAccessHandle` needs a worker context)
- Single core implementation; only the `RandomAccessFile`,
  `PersistenceBackend`, and `Transport` factories differ per runtime

## Quick start

### Node.js

```ts
import { mount } from "@adobe/data-persistence";
import { createNodeFsProvider } from "@adobe/data-persistence/node";
import { Database } from "@adobe/data/ecs";

const db = Database.create(myPlugin);
const provider = createNodeFsProvider("/tmp/my-save");
const m = await mount(provider, db);

await m.service.load(); // restore previous session

// ... run game / app ...

await m.service.flush();
await m.service.checkpoint();
await m.dispose(); // flushes, closes transport, releases lock
```

Pass `{ worker: true }` to move I/O off the calling thread into a
`node:worker_threads` worker:

```ts
const provider = createNodeFsProvider("/tmp/my-save", { worker: true });
```

### Browser (inside a Vite app)

```ts
import { mount } from "@adobe/data-persistence";
import { createOpfsProvider } from "@adobe/data-persistence/browser";
import { Database } from "@adobe/data/ecs";

const db = Database.create(myPlugin);
// Omit the argument to use the per-origin OPFS root (the common case).
const provider = createOpfsProvider();
const m = await mount(provider, db);

await m.service.load(); // restore previous session

// ... run app ...

await m.service.flush();
await m.service.checkpoint();
await m.dispose(); // flushes, closes OPFS worker, releases lock
```

See [`examples/node-basic.ts`](./examples/node-basic.ts) and
[`examples/browser-main.ts`](./examples/browser-main.ts) for complete
annotated examples with write and read passes.

## Public entry points

| Import path | Use from |
|---|---|
| `@adobe/data-persistence` | runtime-agnostic surface (interfaces, `mount`, `createMemoryProvider`, service factory) |
| `@adobe/data-persistence/browser` | OPFS backend + browser worker transport + `createOpfsProvider` |
| `@adobe/data-persistence/node` | `node:fs` backend + `node:worker_threads` transport + `createNodeFsProvider` |

## API reference

### `mount(provider, database, options?)`

The single entry point for all persistence. Returns a `PersistenceMount`.

```ts
const m = await mount(provider, database, {
  autoPersist: true,                  // default: true
  checkpoint: {
    everyNTransactions: 1000,         // default: 1000
    idleMs: 5000,                     // default: 5000
  },
});
```

### `PersistenceMount`

```ts
interface PersistenceMount {
  service: IncrementalPersistenceService;
  dispose(): Promise<void>;
}
```

### `IncrementalPersistenceService`

```ts
interface IncrementalPersistenceService {
  serviceName: string;
  save(): Promise<void>;
  load(): Promise<void>;
  flush(): Promise<void>;
  checkpoint(): Promise<void>;
  dispose(): Promise<void>;
}
```

## Writing a custom cloud provider

External implementers choose one of two seams depending on whether their
storage supports byte-range writes.

### Pattern A — byte-range capable storage

Implement `PersistenceBackend` + `RandomAccessFile`. Then wrap with
`createInprocessTransport` + `createIncrementalPersistenceService`. This
reuses 95% of the existing code and supports the full journal + checkpoint
strategy automatically.

```ts
import type { PersistenceProvider } from "@adobe/data-persistence";
import { createInprocessTransport, createIncrementalPersistenceService } from "@adobe/data-persistence";

export const createMyCloudProvider = (client: CloudClient): PersistenceProvider => ({
  providerName: "MyCloudProvider",
  async mount(database, opts) {
    const backend = createMyCloudBackend(client); // implements PersistenceBackend
    const transport = createInprocessTransport(backend);
    const service = await createIncrementalPersistenceService({
      database, backend, transport,
      autoPersist: opts?.autoPersist,
      checkpoint: opts?.checkpoint,
    });
    return {
      service,
      dispose: async () => { await service.dispose(); await transport.close(); },
    };
  },
});
```

If your backend does not currently support byte-range writes but will in
the future, declare it via the optional `capabilities` field:

```ts
const backend: PersistenceBackend = {
  capabilities: { byteRangeWrites: false },
  async open(relPath) { /* ... */ },
  // ...
};
```

### Pattern B — whole-file storage

Implement `PersistenceProvider` directly. Inside `mount()`, observe
`database.observe.transactions` and accumulate deltas; on
`flush`/`checkpoint`/`dispose`, push a complete blob to the cloud. Skip
the journal and manifest entirely — the provider author owns the delta
strategy.

```ts
import type { PersistenceProvider, PersistenceMount } from "@adobe/data-persistence";

export const createBlobProvider = (client: BlobClient): PersistenceProvider => ({
  providerName: "BlobProvider",
  async mount(database, opts): Promise<PersistenceMount> {
    // Observe transactions, accumulate state, push blob on checkpoint/dispose.
    const service = createBlobPersistenceService(client, database, opts);
    return { service, dispose: () => service.dispose() };
  },
});
```

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

## Performance

Two complementary guarantees:

### Algorithmic complexity (O(changes))

The cost of persisting a transaction T is **O(touched_columns + changed_entities)** — independent of total world size, archetype row capacity, or the number of registered archetypes. Verified by `src/service/persistence-complexity.test.ts`, which counts `PersistOp` messages emitted per transaction across worlds of N=10, 100, and 500 entities and asserts the count is identical:

| Transaction shape | Ops emitted (any N) |
|---|---|
| Update 1 component on 1 entity | 4 (journal entry + column slice + ELT + commit) |
| Update 3 components on 1 entity | 8 |
| Insert (3-column archetype) | 8 |
| Delete + 1 swap-remove side effect | 10 |

For **fixed-stride columns** (number, struct, enum) `checkpoint()` scales with archetype × column count (manifest schema), not row count — column slices are written incrementally per transaction, so the checkpoint just writes the manifest and truncates the journal.

For **journal-storage columns** (`"array"` typed buffers — variable-length per-row values) the checkpoint additionally writes a full per-column snapshot file whose cost is O(rowCount × mean value size) for each such column. At load time that snapshot is restored before journal replay, so these columns are fully durable across checkpoints. If your schema has no `"array"` columns, checkpoint cost remains independent of row count.

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

Read these as comparative ratios, not absolute targets — the 2.2× ratio between 1-column and 3-column updates confirms the per-component-write optimization is doing useful work. The flat checkpoint cost (~140 μs regardless of row count) holds for fixed-stride-only schemas; schemas with `"array"` (journal-storage) columns incur an additional O(rowCount × mean value size) write per such column at checkpoint time.

Worker-thread transports (browser OPFS, Node `worker_threads`) add 1–10 μs of `postMessage` round-trip per op on top of these numbers, plus real disk I/O at checkpoint and load.
