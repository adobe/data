# @adobe/data-sync

Real-time multi-user synchronization for `@adobe/data` ECS databases.

Brings multiple `Database` instances — on different machines, tabs, or
processes — into convergent agreement using a lightweight ordering server and
an OT-free, replay-based consistency model.

## Mental model

Application code calls `db.transactions.X(args)`. That is the entire sync API.
The sync layer is a background service that subscribes to the database's
outbound envelope stream and forwards envelopes to the transport — there is no
`propose` / `sendTransient` surface for callers to call.

```
                     ┌──────────────────────────────┐
                     │         SyncServer           │
                     │  (pure ordering service,     │
                     │   stateless except for log)  │
                     └────────┬─────────────────────┘
              propose │        │ committed (broadcast)
                      ▼        ▼
          ┌─────────────────────────────────┐
          │     Database + SyncService      │
          │  ┌──────────────────────────┐   │
          │  │     ReconcilingDatabase  │   │
          │  │  committed │  transients │   │
          │  │  ──────────┼─────────── │   │
          │  │  apply(t)  │ rollback /  │   │
          │  │            │   replay    │   │
          │  └──────────────────────────┘   │
          └─────────────────────────────────┘
```

The sync layer is not a CRDT and does not merge conflicting mutations at the
byte level. Instead it exploits a property of the ECS model: **transaction
functions are deterministic pure functions of `(store, args)`**, so replaying
the same sequence of `(name, args)` pairs from any starting state always
produces the same result. The server assigns a canonical ordering; clients
execute that ordering locally.

### Commit lifecycle

1. App code calls `db.transactions.spawnUnit({ x: 0, y: 0, hp: 100 })`.
2. The wrapper applies the envelope locally as a **transient** (optimistic)
   because the sync service has put the database in deferred-commit mode.
3. The wrapper notifies `db.observe.envelopes` with `intent: "commit"`.
4. The sync service forwards the envelope as `kind: "propose"`.
5. The server assigns a monotonic `time` and broadcasts a `committed` envelope
   to every connected client.
6. Each client (including the proposer) calls `db.apply(committed)`, which:
   - Rolls back all local transients.
   - Applies the committed transaction on the clean committed state.
   - Re-applies remaining transients on top.
7. The proposer's transient is promoted to committed; other clients see the
   change as an incoming commit from a peer.

The result is **convergent, causally ordered** state across all peers with
no server-side database.

### Transient envelopes (presence, drag previews, cursors)

Async-generator transactions yield intermediate transient envelopes. The
sync service forwards each yield as `kind: "transient"` — relayed to peers,
never logged, never persisted. The server drops them if the rate exceeds
`maxTransientsPerSecond`. Each peer's `(userId, id)` compound key keeps the
transient queue de-duplicated: a new yield with the same id replaces the
previous one in the reconciler.

The "never-ending transaction" pattern uses an async generator that yields
forever (e.g. for live cursor positions):

```ts
db.transactions.movePresence(async function* () {
    for await (const [x, y] of pointerObservable) {
        yield { userId, x, y };
    }
});
```

The transaction never commits; every yield is a transient envelope; sync
forwards each to peers; peers see continuously-updated presence state.

### Ephemeral resources stay local

Resources marked `ephemeral: true` in their schema (or entities allocated
with the built-in `ephemeral` component) produce transactions whose
`TransactionResult.ephemeral === true`. The sync service skips those
envelopes entirely — they never reach the wire. Use this for per-tab UI
state (selection, panel positions, signaling intermediaries, etc.) without
inventing a second database.

## Quick start

### Server (Node.js)

```ts
import { createSyncServer, createWebSocketServerTransport } from "@adobe/data-sync";
import { WebSocketServer } from "ws";

const syncServer = createSyncServer();
const wss = new WebSocketServer({ port: 4000 });

wss.on("connection", (ws) => {
    const transport = createWebSocketServerTransport(ws);
    const disconnect = syncServer.connect(transport);
    ws.on("close", disconnect);
});
```

### Client (browser or Node.js)

```ts
import { Database } from "@adobe/data/ecs";
import { createSyncService, createWebSocketClientTransport } from "@adobe/data-sync";
import { gamePlugin } from "./game-plugin.js";

// userId MUST be unique per peer — the reconciler uses (userId, id) as its
// compound key for transient-replace and cancel semantics, so two peers
// using the same userId would clobber each other's transients.
const db = Database.create(gamePlugin, { userId: crypto.randomUUID() });

const transport = createWebSocketClientTransport({ url: "ws://localhost:4000/sync" });
const sync = createSyncService({ database: db, transport });

// All mutations flow through the standard transactions API:
db.transactions.spawnUnit({ x: 0, y: 0, hp: 100 });

// Tear down when done:
sync.dispose();
```

### In-process / single machine (testing, embedded)

```ts
import { createSyncServer, createSyncService, createLoopbackTransport } from "@adobe/data-sync";

const server = createSyncServer();
const { client: ct, server: st } = createLoopbackTransport();
server.connect(st);

const db = Database.create(myPlugin, { userId: "test-peer" });
const sync = createSyncService({ database: db, transport: ct });
```

## API

### `createSyncServer(options?)`

Returns a `SyncServer` — a pure ordering service that:

- Assigns monotonically increasing commit timestamps to accepted proposals.
- Broadcasts each `committed` envelope to all connected clients.
- Maintains a `committedLog` so late-joining clients receive full history on
  connect and converge to current state without a separate snapshot.
- Is entirely stateless with respect to ECS data — it never owns a database.

```ts
interface SyncServer {
    connect(transport: ServerTransport): () => void; // returns disconnect fn
    dispose(): void;
}
```

Auth, validation, and access control are **not** built into the server —
intercept `propose` messages in your own middleware before forwarding to
`SyncServer`.

### `createSyncService(options)`

Wires a `Database` to a `ClientTransport`. There is no public mutation
surface — application code calls `db.transactions.X(args)`.

```ts
interface SyncServiceOptions {
    readonly database: Database<any, any, any, any>;
    readonly transport: ClientTransport;
    /** Default 20. Lossy rate limit for `kind: "transient"` messages. */
    readonly maxTransientsPerSecond?: number;
}

interface SyncService {
    dispose(): void;
}
```

When attached, `createSyncService` puts the database in deferred-commit
mode: `db.transactions.X(args)` calls apply locally as transients and wait
for the server's echo to promote them. This is what guarantees that
concurrent inserts from two peers end up with identical entity IDs on every
peer.

### `Database.create(plugin, { userId })`

The `userId` option is required for any database that will be attached to
a sync service. It is stamped onto every locally-generated envelope and
combined with the per-DB id counter to form the reconciler's compound
`(userId, id)` queue key.

In a single-peer / no-sync deployment `userId` may be omitted.

### Transports

| Factory | Use case |
|---|---|
| `createWebSocketClientTransport(opts)` | Browser or Node.js client |
| `createWebSocketServerTransport(ws)` | Server-side wrapper for an accepted WebSocket |
| `createLoopbackTransport()` | In-process pair for tests or single-tab use |

### `TransactionEnvelope`

The unit of currency on the wire:

```ts
type TransactionEnvelope = {
    readonly id: number;      // per-peer counter
    readonly userId?: number | string; // peer identifier (compound key with id)
    readonly name: string;    // transaction function name
    readonly args: unknown;   // must be JSON-serializable
    readonly time: number;    // negative = transient, positive = committed (server-assigned)
};
```

## Designing transactions for concurrent correctness

The sync layer guarantees **convergent ordering**, not conflict-free
mutations. Whether two concurrent operations from different peers compose
correctly depends entirely on how transaction functions are written.

### The fundamental rule

**Transaction functions must be pure functions of `(store, args)`.**

The reconciling database achieves convergence by rolling back local
transients, applying the server's canonical ordering, and replaying
remaining transients on top. A transaction that reads from external state
(clocks, random numbers, local variables outside the store) will produce
different results on different peers after replay, breaking convergence.

```ts
// ❌ Non-deterministic — reads Date.now() which differs across peers
createTimestampedNote(t, args: { text: string }) {
    t.archetypes.Note.insert({ text: args.text, createdAt: Date.now() });
}

// ✅ Deterministic — timestamp is part of args, captured once by the proposing peer
createTimestampedNote(t, args: { text: string; createdAt: number }) {
    t.archetypes.Note.insert({ text: args.text, createdAt: args.createdAt });
}
```

Other common violations: `Math.random()`, `crypto.randomUUID()`, reading
from a module-level cache, or branching on anything that isn't derived from
`store` or `args`.

### Entity IDs are not stable cross-peer references

Entity IDs are assigned during transaction execution, not in `args`. Two
peers that both create an entity concurrently will get the same local ID
while their operations are transient. After the server orders them and
replay runs, IDs are reassigned canonically — the peer that "lost" the
ordering race will find that the ID it captured in local JavaScript no
longer refers to the same entity.

**Never store an entity ID in a JavaScript variable and use it in a later
`db.transactions.X(...)` call across the network boundary.** The ID seen
synchronously after a transaction call is a transient artifact; after
round-tripping through the server it may have shifted.

### Pattern: embed selection in the store, not in JS variables

A common multi-user interaction is "select something, then act on the
selection". The naïve approach breaks under reordering:

```ts
// ❌ Breaks under concurrent edits
const id = db.transactions.createItem({ x: 0, y: 0 });   // local transient ID = 1
db.transactions.moveItem({ entity: id, dx: 10, dy: 0 }); // captured wrong ID
```

The fix is to record **intent** in the store as part of the same atomic
transaction, keyed by userId rather than by a local ID:

```ts
// ✅ Robust — selection state lives in the store, query by userId
createAndSelectItem(t, args: { x: number; y: number; userId: string }) {
    const entity = t.archetypes.Item.insert({ x: args.x, y: args.y });
    t.archetypes.Selection.insert({ userId: args.userId, target: entity });
}

moveSelectedItems(t, args: { userId: string; dx: number; dy: number }) {
    for (const sel of t.archetypes.Selection.query({ userId: args.userId })) {
        const item = t.read(sel.target);
        if (item) t.update(sel.target, { x: item.x + args.dx, y: item.y + args.dy });
    }
}
```

`createAndSelectItem` is atomic — the insert and the selection record land
in the same transaction. `moveSelectedItems` doesn't capture any ID at the
call site; it re-derives the target from the store at replay time. Both
operations compose correctly regardless of how the server orders concurrent
proposals from different peers.

### Pattern: idempotent "set" over non-idempotent "delta"

When two peers modify the same component concurrently, last-write-wins (by
server ordering) is usually the correct semantic. Write transactions that
set an absolute value rather than applying a relative delta when the intent
is "take ownership of this value":

```ts
// ❌ Fragile — concurrent +10 and +10 produce +20, but the intent was
//    each user independently setting a new position
moveItem(t, args: { entity: number; dx: number; dy: number }) {
    const item = t.read(args.entity)!;
    t.update(args.entity, { x: item.x + args.dx, y: item.y + args.dy });
}

// ✅ Explicit intent — server ordering arbitrates; loser's write is overwritten
setItemPosition(t, args: { entity: number; x: number; y: number }) {
    t.update(args.entity, { x: args.x, y: args.y });
}
```

Relative deltas are correct for commutative operations (e.g. a counter
where every increment is independent). Use them deliberately, not as a
default.

### Pattern: per-user state archetypes

Model user-specific ephemeral state (cursors, selections, presence) as its
own archetype keyed by `userId`. This avoids all contention: each user only
ever writes to their own row.

```ts
const plugin = Database.Plugin.create({
    archetypes: {
        Cursor: ["userId", "x", "y"],
        Selection: ["userId", "target"],
    },
    transactions: {
        // Continuous cursor stream — never-ending async generator yields
        // each new position as a transient envelope. Sync forwards as
        // `kind: "transient"`; peers see it as a transient too. Each new
        // yield replaces the previous transient via the (userId, id)
        // compound key.
        movePresence(t, args: { userId: string; x: number; y: number }) {
            for (const e of t.archetypes.Cursor.query({ userId: args.userId })) {
                t.delete(e);
            }
            t.archetypes.Cursor.insert(args);
        },
    },
});
```

## Server architecture notes

The `SyncServer` is deliberately minimal. For production deployments you
will want to layer on:

- **Authentication** — validate the `userId` in incoming envelopes before
  passing to `server.connect`. Reject connections whose token does not
  match.
- **Authorization** — intercept `propose` messages and check whether the
  `userId` is allowed to execute the named transaction with those args.
- **Persistence** — the `committedLog` lives in memory. For crash
  recovery, persist each committed envelope to durable storage (a
  database, a WAL file) and replay on restart. The
  `@adobe/data-persistence` package can serve as the persistence layer on
  the server side.
- **Horizontal scaling** — multiple server instances require a shared log
  (Redis Streams, Kafka, Postgres LISTEN/NOTIFY) to broadcast committed
  envelopes across instances.
- **Late-join efficiency** — the in-memory `committedLog` replay is fine
  for short-lived sessions. For long-running documents, replace the replay
  with a snapshot + incremental log: serve the latest `db.toData()`
  snapshot and only replay envelopes since that snapshot's checkpoint.

## Transport contract

Transports must preserve **send ordering** and guarantee **delivery** for
`propose` and `committed` messages. The committed stream is the source of
truth; a dropped `committed` message will leave a client permanently
out-of-sync.

`transient` messages may be dropped or reordered — the server never logs
them and clients treat them as best-effort previews.

WebSocket fulfills the transport contract. UDP, raw QUIC, or other
unordered channels require a reliability layer on top before use.

## Testing

Use `createLoopbackTransport` to wire server and client in-process without
any network or async I/O. The loopback transport buffers messages that are
sent before a listener is registered, so synchronous test code works
without `await` gymnastics:

```ts
import { Database } from "@adobe/data/ecs";
import { createSyncServer, createSyncService, createLoopbackTransport } from "@adobe/data-sync";

const server = createSyncServer();
const { client: ct, server: st } = createLoopbackTransport();
server.connect(st);

const db = Database.create(myPlugin, { userId: "test" });
const sync = createSyncService({ database: db, transport: ct });

db.transactions.createPoint({ x: 1, y: 2 });
// State is synchronously committed through the loopback — no await needed.
expect(db.select(["x"]).length).toBe(1);
```

See `src/sync.test.ts` for the full soundness suite, including concurrent
insert ordering, late-join convergence, ephemeral-no-replicate, and
compound `(userId, id)` isolation.
