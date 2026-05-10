# @adobe/data-sync

Real-time multi-user synchronization for `@adobe/data` ECS databases.

Brings multiple `ReconcilingDatabase` instances — on different machines, tabs,
or processes — into convergent agreement using a lightweight ordering server
and an OT-free, replay-based consistency model.

## Mental model

The sync layer sits between your application code and the `ReconcilingDatabase`.
It is not a CRDT and does not merge conflicting mutations at the byte level.
Instead it exploits a property of the ECS model: **transaction functions are
deterministic pure functions of `(store, args)`**, so replaying the same
sequence of `(name, args)` pairs from any starting state always produces the
same result. The server assigns a canonical ordering; clients execute that
ordering locally.

```
                     ┌──────────────────────────────┐
                     │         SyncServer           │
                     │  (pure ordering service,     │
                     │   stateless except for log)  │
                     └────────┬─────────────────────┘
              propose │        │ committed (broadcast)
                      ▼        ▼
          ┌─────────────────────────────────┐
          │           SyncClient            │
          │  ┌──────────────────────────┐   │
          │  │   ReconcilingDatabase    │   │
          │  │  committed │  transients │   │
          │  │  ──────────┼─────────── │   │
          │  │  apply(t)  │ rollback /  │   │
          │  │            │   replay    │   │
          │  └──────────────────────────┘   │
          └─────────────────────────────────┘
```

### Commit lifecycle

1. User action calls `client.propose(envelope)`.
2. The client applies the envelope locally as a **transient** (optimistic).
3. The server assigns a monotonic `time` and broadcasts a `committed` envelope
   to every connected client.
4. Each client calls `db.apply(committed)`, which:
   - Rolls back all local transients.
   - Applies the committed transaction on the clean committed state.
   - Re-applies remaining transients on top.
5. The proposing client's own transient is promoted to committed; other clients
   see the change as an incoming commit from a peer.

The result is **convergent, causally ordered** state across all peers with no
server-side database.

### Transient signals

Transient envelopes (`sendTransient`) are relayed to peers but never logged and
never persisted. Use them for high-frequency, lossy signals: cursor positions,
drag previews, lasso rubber-bands, drawing strokes. Wrap the transport in
`createLossyTransientTransport` to rate-limit the outbound stream.

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
import { createSyncClient, createWebSocketClientTransport, createLossyTransientTransport } from "@adobe/data-sync";
import { createReconcilingDatabase } from "@adobe/data/ecs";

const db = createReconcilingDatabase(database);

// Rate-limit transient messages (cursor, drag) to 20/s; proposals are reliable.
const ws = createWebSocketClientTransport({ url: "ws://localhost:4000/sync" });
const transport = createLossyTransientTransport({ reliableTransport: ws });
const client = createSyncClient({ database: db, transport });

// Propose a commit — applied locally as transient, confirmed by server:
client.propose({
  id: nextId(),
  name: "spawnUnit",
  args: { x: 0, y: 0, hp: 100 },
  time: -1,        // negative = transient; the server assigns the final time
  userId: myUserId,
});

// Broadcast a cursor position to peers (lossy, never committed):
client.sendTransient({
  id: CURSOR_ID,
  name: "moveCursor",
  args: { userId: myUserId, x, y },
  time: -1,
});

// Tear down:
client.dispose();
```

### In-process / single machine (testing, embedded)

```ts
import { createSyncServer, createSyncClient, createLoopbackTransport } from "@adobe/data-sync";

const server = createSyncServer();
const { client: ct, server: st } = createLoopbackTransport();
const disconnect = server.connect(st);

const client = createSyncClient({ database: myReconcilingDb, transport: ct });
```

## API

### `createSyncServer(options?)`

Returns a `SyncServer` — a pure ordering service that:

- Assigns monotonically increasing commit timestamps to accepted proposals.
- Broadcasts each `committed` envelope to all connected clients.
- Maintains a `committedLog` so late-joining clients receive full history
  on connect and converge to current state without a separate snapshot.
- Is entirely stateless with respect to ECS data — it never owns a database.

```ts
interface SyncServer {
  connect(transport: ServerTransport): () => void; // returns disconnect fn
  dispose(): void;
}
```

Auth, validation, and access control are **not** built into the server —
intercept `propose` messages in your own middleware layer before forwarding
to `SyncServer`.

### `createSyncClient(options)`

Bridges a `ReconcilingDatabase` and a `ClientTransport`.

```ts
interface SyncClient {
  propose(envelope: TransactionEnvelope): void;
  sendTransient(envelope: TransactionEnvelope): void;
  cancel(id: number): void;
  dispose(): void;
}
```

| Method | What it does |
|---|---|
| `propose` | Applies envelope transiently to local DB; forwards `propose` to server. On server echo the transient is promoted to committed. |
| `sendTransient` | Applies transiently to local DB; sends `transient` to server for relay to peers. Never committed, never persisted. |
| `cancel` | Rolls back a local transient; notifies server to relay `cancelled` to peers. |
| `dispose` | Unsubscribes from transport; closes the connection. |

### Transports

| Factory | Use case |
|---|---|
| `createWebSocketClientTransport(opts)` | Browser or Node.js 22+ client |
| `createWebSocketServerTransport(ws)` | Server-side wrapper for an accepted WebSocket |
| `createLoopbackTransport()` | In-process pair for tests or single-tab use |
| `createLossyTransientTransport(opts)` | Adapter that rate-limits outbound `transient` messages |

### `TransactionEnvelope`

The unit of currency for the sync layer:

```ts
type TransactionEnvelope = {
  readonly id: number;      // unique per client session; used to correlate transient → committed
  readonly name: string;    // transaction function name
  readonly args: unknown;   // must be JSON-serializable
  readonly time: number;    // negative = transient, positive = committed (assigned by server)
  readonly userId?: number | string; // optional attribution; ignored by the reconciler
};
```

`id` values must be unique within a client session. A simple monotonic counter
(`let nextId = 0; () => ++nextId`) is sufficient.

## Designing transactions for concurrent correctness

This is the most important section for integrators. The sync layer guarantees
**convergent ordering**, not conflict-free mutations. Whether two concurrent
operations from different users compose correctly depends entirely on how
transaction functions are written.

### The fundamental rule

**Transaction functions must be pure functions of `(store, args)`.**

The reconciling database achieves convergence by rolling back local transients,
applying the server's canonical ordering, and replaying remaining transients on
top. A transaction that reads from external state (clocks, random numbers,
local variables outside the store) will produce different results on different
peers after replay, breaking convergence.

```ts
// ❌ Non-deterministic — reads Date.now() which differs across peers
createTimestampedNote(t, args: { text: string }) {
  t.archetypes.Note.insert({ text: args.text, createdAt: Date.now() });
}

// ✅ Deterministic — timestamp is part of args, captured once by the proposing client
createTimestampedNote(t, args: { text: string; createdAt: number }) {
  t.archetypes.Note.insert({ text: args.text, createdAt: args.createdAt });
}
```

Other common violations: `Math.random()`, `crypto.randomUUID()`, reading from
a module-level cache, or branching on anything that isn't derived from `store`
or `args`.

### Entity IDs are not stable cross-client references

Entity IDs are assigned during transaction execution, not in `args`. Two clients
that both create an entity concurrently will get the same local ID while their
operations are transient. After the server orders them and replay runs, IDs are
reassigned canonically — the client that "lost" the ordering race will find that
the ID it captured in local JavaScript no longer refers to the same entity.

**Never store an entity ID in a JavaScript variable and use it in a later
`propose` call across the network boundary.** The ID seen at propose time is
a transient artifact; after round-tripping through the server it may have shifted.

### Pattern: embed selection in the store, not in JS variables

A common multi-user interaction is "select something, then act on the
selection". The naïve approach breaks under reordering:

```ts
// ❌ Breaks under concurrent edits
// Client A creates entity, captures local ID 1, then moves it:
const id = db.transactions.createItem({ x: 0, y: 0 });  // local transient ID = 1
client.propose({ name: "createItem", args: { x: 0, y: 0 }, ... });
client.propose({ name: "moveItem", args: { entity: id, dx: 10, dy: 0 }, ... });
// After reorder: id=1 may now point to a peer's entity. moveItem acts on the wrong target.
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
  // Query the store at replay time — always finds the right entity
  for (const sel of t.archetypes.Selection.query({ userId: args.userId })) {
    const item = t.read(sel.target);
    if (item) t.update(sel.target, { x: item.x + args.dx, y: item.y + args.dy });
  }
}
```

`createAndSelectItem` is atomic — the insert and the selection record land in
the same transaction. `moveSelectedItems` doesn't capture any ID at the call
site; it re-derives the target from the store at replay time. Both operations
compose correctly regardless of how the server orders concurrent proposals from
different users.

### Pattern: idempotent "set" over non-idempotent "delta"

When two users modify the same component concurrently, last-write-wins (by
server ordering) is usually the correct semantic. Write transactions that set
an absolute value rather than applying a relative delta when the intent is
"take ownership of this value":

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

Relative deltas are correct for commutative operations (e.g. a counter where
every increment is independent). Use them deliberately, not as a default.

### Pattern: per-user state archetypes

Model user-specific ephemeral state (cursors, selections, presence) as its own
archetype keyed by `userId`. This avoids all contention: each user only ever
writes to their own row.

```ts
const plugin = Database.Plugin.create({
  archetypes: {
    Cursor: ["userId", "x", "y"],
    Selection: ["userId", "target"],
  },
  transactions: {
    setCursor(t, args: { userId: string; x: number; y: number }) {
      // Upsert: remove old cursor for this user, insert new one
      for (const e of t.archetypes.Cursor.query({ userId: args.userId })) {
        t.delete(e);
      }
      t.archetypes.Cursor.insert(args);
    },
  },
});
```

`sendTransient` is ideal for high-frequency cursor updates — they skip the
server log and are relayed directly to peers without any round-trip cost.

## Server architecture notes

The `SyncServer` is deliberately minimal. For production deployments you will
want to layer on:

- **Authentication** — validate the `userId` in incoming envelopes before
  passing to `server.connect`. Reject connections whose token does not match.
- **Authorization** — intercept `propose` messages and check whether the
  `userId` is allowed to execute the named transaction with those args.
- **Persistence** — the `committedLog` lives in memory. For crash recovery,
  persist each committed envelope to durable storage (a database, a WAL file)
  and replay on restart. The `@adobe/data-persistence` package can serve as the
  persistence layer on the server side.
- **Horizontal scaling** — multiple server instances require a shared log
  (Redis Streams, Kafka, Postgres LISTEN/NOTIFY) to broadcast committed
  envelopes across instances. The `SyncServer` interface is thin enough that
  this is a straightforward adapter.
- **Late-join efficiency** — the in-memory `committedLog` replay is fine for
  short-lived sessions. For long-running documents, replace the replay with a
  snapshot + incremental log: serve the latest `db.toData()` snapshot and only
  replay envelopes since that snapshot's checkpoint.

## Transport contract

Transports must preserve **send ordering** and guarantee **delivery** for
`propose` and `committed` messages. The committed stream is the source of
truth; a dropped `committed` message will leave a client permanently
out-of-sync.

`transient` messages may be dropped or reordered — the server never logs them
and clients treat them as best-effort previews.

WebSocket fulfills the transport contract. UDP, raw QUIC, or other unordered
channels require a reliability layer on top before use.

## Testing

Use `createLoopbackTransport` to wire server and client in-process without any
network or async I/O. The loopback transport buffers messages that are sent
before a listener is registered, so synchronous test code works without `await`
gymnastics:

```ts
import { createSyncServer, createSyncClient, createLoopbackTransport } from "@adobe/data-sync";

const server = createSyncServer();
const { client: ct, server: st } = createLoopbackTransport();
server.connect(st);

const db = createReconcilingDatabase(myDatabase);
const client = createSyncClient({ database: db, transport: ct });

client.propose({ id: 1, name: "createPoint", args: { x: 1, y: 2 }, time: -1 });
// State is synchronously committed through the loopback — no await needed.
expect(db.select(["x"]).length).toBe(1);
```

See `src/sync.test.ts` for the full soundness suite, including concurrent
insert ordering, late-join convergence, and transient-vs-committed isolation.
