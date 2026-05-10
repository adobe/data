# P2P Tic-Tac-Toe — Architecture

A serverless two-player game that runs entirely in the browser.
No backend required: signaling is done by copy-pasting SDP blobs, and
real-time sync runs over a WebRTC DataChannel.

---

## Current architecture — in-memory sync, no persistence

```mermaid
sequenceDiagram
    participant H  as Host browser
    participant WR as WebRTC DataChannel
    participant J  as Joiner browser

    Note over H,J: Connection setup (one-time)
    H->>H: RTCPeerConnection offer + gather ICE
    H-->>J: copy-paste SDP offer
    J->>J: RTCPeerConnection answer + gather ICE
    J-->>H: copy-paste SDP answer
    H->>WR: DataChannel opens

    Note over H,J: Live game — committed moves
    H->>H: SyncClient.propose(playMove)
    H->>H: ReconcilingDB.apply(transient)
    H->>WR: {kind:"propose", envelope}
    WR->>H: SyncServer receives → assigns time
    H->>H: SyncServer.broadcast committed → loopback client
    H->>H: ReconcilingDB.apply(committed) → rollback/rebase
    H->>WR: SyncServer.broadcast committed → WebRTC transport
    WR->>J: {kind:"committed", envelope}
    J->>J: ReconcilingDB.apply(committed)

    Note over H,J: Live game — presence (transient, never committed)
    H->>H: pointermove → SyncClient.sendTransient(movePresence)
    H->>H: ReconcilingDB.apply(time=-1) → cursorX resource updates
    H->>WR: {kind:"transient", envelope}
    WR->>J: SyncServer relays as {kind:"committed", time=-1}
    J->>J: ReconcilingDB.apply(time=-1) → cursorX resource updates
    J->>J: cursor dot re-renders on board
```

### Component map

```mermaid
graph TD
    subgraph "Host browser"
        HDB[ReconcilingDatabase]
        HSC[SyncClient — loopback]
        HSrv[SyncServer]
        HWR[WebRTC ServerTransport]
        HLL[Loopback ServerTransport]
    end

    subgraph "Joiner browser"
        JDB[ReconcilingDatabase]
        JSC[SyncClient — WebRTC]
        JWR[WebRTC ClientTransport]
    end

    HSC -->|propose / transient| HLL
    HLL <-->|messages| HSrv
    HSrv <-->|messages| HWR
    HWR <-.->|DataChannel| JWR
    JWR <-->|messages| JSC
    JSC --> JDB
    HSrv -->|committed broadcast| HLL
    HLL --> HSC
    HSC --> HDB
```

**Key points:**

- The host runs both `SyncServer` and its own `SyncClient` (via an
  in-process loopback transport). This lets the host receive its own
  committed envelopes and go through the same rollback/rebase path as the
  joiner — keeping both databases byte-identical.
- The joiner connects with a single `SyncClient` over the WebRTC transport.
- `sendTransient` envelopes (presence cursors) bypass the server's commit
  log. The server relays them to peers with `time: -1`, which the
  reconciling DB applies as a transient — overwriting the previous cursor
  position in the queue without committing.

---

## What adding persistence would look like

Persistence can be layered on the host's database **independently** of sync —
the two packages share only the committed `TransactionEnvelope` stream and
have no coupling to each other.

```mermaid
graph TD
    subgraph "Host browser (with persistence)"
        HDB[ReconcilingDatabase]
        HSC[SyncClient — loopback]
        HSrv[SyncServer]
        HWR[WebRTC ServerTransport]
        HLL[Loopback ServerTransport]
        HPROV[OPFS PersistenceProvider]
        HMNT[PersistenceMount]
    end

    subgraph "Joiner browser"
        JDB[ReconcilingDatabase]
        JSC[SyncClient — WebRTC]
        JWR[WebRTC ClientTransport]
    end

    HSC -->|propose| HLL
    HLL <-->|messages| HSrv
    HSrv <-->|messages| HWR
    HWR <-.->|DataChannel| JWR
    JWR <-->|messages| JSC
    JSC --> JDB

    %% Persistence hooks into the committed stream
    HPROV -->|mount| HMNT
    HMNT -->|observe committed transactions| HDB
    HMNT -->|write journal| HPROV

    %% On reconnect: replay journal → database
    HPROV -.->|reload journal| HDB
```

### What needs to be built

1. **Host-side persistence** — straightforward:
   ```ts
   import { mount, createOpfsProvider } from "@adobe/data-persistence/browser";
   const persistenceMount = await mount(createOpfsProvider(), hostDb);
   ```
   All committed transactions are journalled automatically. On page reload
   the host calls `mount` again and the journal is replayed into a fresh DB.

2. **Catch-up on joiner connect** — the one gap that would need to be added
   to `@adobe/data-sync`:

   Currently `SyncServer` is stateless — it holds the committed log already
   (see `committedLog` in `create-sync-server.ts`) and replays it to new
   clients on `connect()`. So a joiner who connects *after* moves have been
   made will already receive the full history. **This actually works today.**

   The gap is cross-session persistence: if the host reloads the page, the
   in-memory `committedLog` is lost. Replaying the journal into `hostDb`
   restores the database state, but a *new* `SyncServer` instance starts
   with an empty `committedLog`. The fix would be to pre-populate
   `committedLog` from the replayed journal before accepting new connections.

---

## Presence data flow

```mermaid
flowchart LR
    MM[pointermove event]
    ST["sendTransient\n{name:'movePresence',\nargs:{mark,x,y},\ntime:-1}"]
    LDB["Local DB\ncursorX/O resource"]
    WR[WebRTC DataChannel]
    RDB["Remote DB\ncursorX/O resource"]
    UI[cursor dot re-renders]

    MM --> ST
    ST -->|apply locally| LDB
    ST -->|relay| WR
    WR -->|apply time=-1| RDB
    RDB --> UI
```

Presence uses **fixed envelope IDs** per player (`PRESENCE_ID.X = 0xF001`,
`PRESENCE_ID.O = 0xF002`). When `database.apply({ ..., time: -1 })` is
called with the same ID, the reconciling DB's rollback/reinsert logic
*replaces* the old entry rather than accumulating one per frame. The queue
therefore holds at most one cursor entry per player at any time.

Presence envelopes are never committed; they evaporate if the connection
drops. This is the correct semantic for ephemeral UI state.
