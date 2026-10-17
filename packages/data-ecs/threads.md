# Running one world across threads

How one world runs across the main thread and workers: which thread owns structure, where objects live, how systems
and observers on other threads stay consistent without stalling the world's thread, and the phases that build it.
Referenced from `design.md`.

## Terms

- **Struct:** numbers, booleans, entities, fixed-length tuples and structs of those. A struct has a fixed size and
  lives in shared memory: columns, ticks, the entity table and resource cells of struct type, all in the arena
  (`memory.ts`), readable and writable from any thread the schedule gives them to. A struct has no thread.
- **Object:** every other value: strings, variable-length arrays, plain objects, DOM nodes, GPU objects, functions.
  Each object component and object resource lives on one logical thread, and only the thread filling it reads or
  writes it. Objects are never copied between threads; one declared `transfer: true` may be moved, never copied.
- **Logical thread:** a name in the augmentable `Threads` interface. `world` and `main` are built in. A joined thread
  fills the logical threads it claims; the world's thread fills every one no joined thread claims.

## Model

- **The world lives on the thread that creates it.** That thread, `world`, runs the loop, every sync point (plan,
  finalize, apply), struct observers, the kernel pool and the GPU device. Any thread can create a world; it stays
  there for the world's life.
- **The loop is core.** A world ticks the systems `add` gave it, on the beats of its `cadence`, with its state as
  resources: `cadence`, `always`, `wake`, `clock` and `report`. One world runs one loop.
- **There's no GPU thread.** `gpuDevice` lives on `world`, with the world, so GPU storage, kernels and render systems
  never wait on another thread.
- **Objects default to `world`.** A declaration without `thread` is on `world`; one with it names a logical thread.
  Libraries declare threads on components; the application decides which joined thread fills each.
- **The DOM rule:** a DOM `Node` lives on `main`, the window's thread, and its declaration says so: the types require
  `thread: "main"` where the DOM library is loaded, and registration checks it on values it can see.
- **Inline is the same layout.** With every logical thread filled by the world's thread, storage and code paths are
  those of today; nothing below adds work to a one-thread world.

## Interface

```ts
// Augmentable, as Components and Resources are. Built in:
export interface Threads {
    world: true;   // the thread that created the world
    main: true;    // the window's thread, where the DOM is
}

declare module "@adobe/data-ecs" {
    interface Components {
        // A DOM Node lives on "main", and says so; the check resolves to no requirement where the DOM library isn't loaded.
        [domNode]: { type: HTMLElement; thread: "main" };
        // `transfer: true` requires a Transferable type: ArrayBuffer, ImageBitmap, VideoFrame, OffscreenCanvas, MessagePort.
        [textureSource]: { type: ImageBitmap; thread: "loader"; transfer: true };
    }
}
// `thread` only on objects: a struct with `thread` fails in types and at registration.
Component.register(domNode, { thread: "main" });
Component.register(textureSource, { thread: "loader", transfer: true });

// On the thread that will hold the world.
const world = World.create(resources?);
world.share(port);   // lets another thread join through the port

// On another thread, after importing the modules whose systems, observers and finalizers run there.
const joined = World.join(port, { threads: ["main"] });   // a MessagePort, or a worker's own scope
```

`World.join` returns the same `World` type. Its `run` and `observe` work as on the world's thread, and its `dispose`
disconnects this thread; disposing on the world's thread disposes the world. Each joined thread is an entity of the
world, whose `threadPort`, `threadClaims` and `threadStatus` (`"joining"`, `"joined"`, `"gone"`) show its progress.

**Not yet supported:** `share` and `join` throw at the call until the joining phase below.

## Placement rules

All derived from declarations when they're made; none is a flag.

- **A system's thread** is the thread of every object component and object resource it names in `read`, `write`,
  `added`, `changed`, `lookup`, `up` and resource `is`. Components in `has` and `not` are structural, and read a shared
  presence word, so they don't place it. With no objects, a kernel runs on the pool and any other system on `world`.
  Render systems and `kernel: "gpu"` systems are on `world`, with `gpuDevice`.
- **Errors when declared:** objects of two threads in one system or finalizer, in types and at creation. Errors when
  joining: a thread claimed twice, or a claimed thread whose systems that joined thread hasn't imported (checked by
  name, once).
- **A terminal system** writes only objects of its own thread, issues no commands, writes no struct component or
  struct resource, and looks up no struct component. DOM-writing systems and render systems are terminal. A terminal
  system on another thread runs as a tail (see Tails). A non-terminal system on a thread other than `world` is a
  blocking tier, and the tick's report lists it under a new `warnings` entry.
- **Observers:** one that names objects of a thread other than its own throws at subscribe. A struct-only observer is
  evaluated on `world`. One that names its own thread's objects is evaluated on its thread.
- **Finalizers** that read objects run on their thread. Their context has no `commands` and no resource writes, in
  types and at creation, and `before`/`after` across threads is an error at creation.

## Mechanisms

### The loop

- **Cadence.** `frame` beats on `requestAnimationFrame` where the world's thread has it, and on a timer otherwise;
  `fixed` beats every `step` milliseconds, running at most `maxSteps` ticks when behind and dropping the rest.
- **Ticks and wakes.** A beat ticks only where `always` is set, `wake` (a reduced resource, `"min"`) is due, or a run
  arrived since the last tick. A quiet loop schedules nothing, and a fixed loop builds no debt while quiet. The
  clock's own writes never wake it.
- **`run(system, input)`** is a transaction: runs are sequential in call order, each its own sync point, and each one
  makes the next beat tick. Runs from joined threads land in the same order through command rings, with merge tags.
- **Failures of ticks** are in the `report` resource. A thread that dies doesn't reject a run or a tick: its systems
  are in `skipped`, with a `"thread"` failure.
- **Observers** notify after each run or tick that changed what they observe; nothing promises a notification before
  `run` resolves. A quiet loop delivers nothing.

### Shared layout directory

Per archetype in the arena: `count`, `capacity`, the `entities` offset, and per storage its column, tick and
chunk-tick offsets. The world's thread keeps its JS fields as the source of truth on its hot paths and writes each
record only at sync points, for archetypes created, grown or whose count changed. Every other thread indexes
whole-buffer typed views (`u8`, `u32`, `i32`, `f32`, `f64` over `memory.buffer`) by those offsets, rebuilding the views
only when a shared byte-length word moves. Only new components (schemas) and new archetypes (sorted component ids) are
posted. This replaces `publish.ts`'s layout broadcast and the per-lookup directories' archetype records.

### Task rings

The pool's ring (`pool.ts`, `protocol.ts`) generalized to every thread. Pool workers are nested workers of the world's
thread by default; the main thread may create them and pass their ports instead. Each ring has posted, done, epoch and
signal words on their own cache lines, plus payload words: task kind, system index, tick, `lastRun`, input offset, and
**the sync number the task needs replayed through**. Workers wait in a window with `Atomics.wait`. The main thread
can't block: it waits with `Atomics.waitAsync`, or a posted message where that's unavailable. Consecutive tiers whose
systems are all on one thread go as one task, with no barrier between them.

### Command rings

One ring per thread in shared memory, with that thread as its only writer, drained by the world's thread at the sync
point. Each block carries a merge tag (tier, system index, chunk index), so the merge order never depends on which
thread ran a chunk. Structs are written through each component's layout writer. An object of the issuing thread's own
logical thread stays there in a staging array; the ring carries its slot number. Worker kernels write their commands
here instead of posting `CommandBuffer`s back. `run(system, input)` from another thread writes an entry, encoding
struct input through its schema; other input is structured-cloned, as a command is. `run` resolves through a
completion word, and the report is posted only when it isn't clean.

### Object columns on other threads

By row on their thread, exactly as `storage.values[row]` is today, so iteration costs nothing more. Their `added` and
`changed` ticks live beside them on that thread, by row, so writes and stamps there touch nothing shared.

**The move log.** For archetypes containing an object component of a thread other than `world`, apply appends, in
apply order: `move(fromArchetype, fromRow, toArchetype, toRow)`, `swap(archetype, lastRow, row)`,
`append(archetype, row, slot)`, `set(archetype, row, component, slot)`, and range forms for bulk operations, 16 bytes
each, tagged by sync number. That thread replays lazily: before a task whose payload names sync S, or an observer
evaluation, it processes each pending sync in order: its finalizers first, against values still at their pre-apply
rows, then its log. A staged slot that no entry of sync S names was dropped, and is cleared without a finalizer. The log
holds at most the thread's row count of entries, at least 4096; past that it drops them, and a thread behind rebuilds:
it keeps an entity column per archetype it holds objects of (8 bytes a row, updated by replay), maps index to value
from its old rows, and refills from the shared `entities`.

### Finalizers on other threads

Before apply, the world's thread writes a stop list per thread: each stopped entity, its pre-apply archetype and row,
and a copy of the struct components the finalizer declares in `read`. The thread runs its finalizers when it next
processes that sync, in declared order within the thread, then stores "finalized through sync N". The guarantee: each
such finalizer runs exactly once per stop, on its thread, before that thread's next task or observer evaluation after
the sync point and before the entity's index is reused, seeing its declared struct reads and its thread's objects as of
before apply. Indexes whose entities had such finalizers return to the free list only after their threads acknowledge.

### Struct observers and mailboxes

A joined thread posts its query once at subscribe; the first value comes later, as `Observe` allows. After each run or
tick, the world's thread runs the cheap candidate check it runs today (`observers.ts`) and writes each changed result
into that thread's mailbox: a triple buffer in shared memory (three slots, the latest index swapped with
`Atomics.exchange`), so the writer never waits and the reader takes the newest complete slot. Results carry resource
cells, listed entity components, or the entity list of `select`; never objects. One `Atomics.notify` per thread per
tick with deliveries. A whole-entity observer (`observe.entity(entity)` without options) on a joined thread gives
struct components and its own thread's objects.

### Structure epoch

One shared word, odd only while apply runs. Threads that read entity locations outside a task, observers of their own
objects, read while it's even and check it again after, retrying on a change. Apply is short, so readers don't starve.
Values are never guarded by it: scheduled reads are ordered by tiers, and observers read published results.

### Tails

Tails at the end of tick N sit just before the head of tick N+1, and ordinary scheduling applies across that boundary.
A tier in N+1 that writes what a tail reads waits for the tail's reads, which end when its body ends; nothing else
waits. A sync point counts as a write to everything a tail reads.

- **Fallback snapshot.** Sometimes a conflicting writer in N+1 is ready before the tail has finished its reads, as when
  main is late. The world's thread then copies the declared struct reads of the tail's passing rows, with their
  entities, into a tail buffer and goes on; the tail reads the copy. The values are the same either way, so this stays
  deterministic. A prompt main never copies.
- **The tail's own objects** are read where they are. The next sync point's moves wait in the log until the tail
  finishes.
- **Report.** A tick resolves after its tails, so their failures are in its report.

### Transfers

A `transfer: true` value set from another thread is posted with its transfer list straight to its thread, on a channel
the world sets up between joined threads, keyed by slot. The command carrying that slot applies at the first sync point
after that thread acknowledges receipt; until then it carries to the next, so the world's thread never waits on
delivery.

### Without cross-origin isolation

Memory isn't shared, so the world runs inline: `share` and `World.join` throw.

## Cost

| Common operation | Cost |
|---|---|
| Iterating rows, struct or object, on any thread | as today: no added load per row |
| A quiet loop | nothing: no tick, no delivery, workers parked |
| A run | its own sync point, in call order; the next beat ticks |
| A sync point with growth, other threads joined | one directory record per changed archetype; a message only for new archetypes or components |
| A tier on a thread other than `world` | one ring post and notify, one done-counter wait; consecutive tiers on that thread are one |
| A blocking tier on main | main's event-loop latency, which the report warns about |
| A terminal tail on main, prompt | one post; nothing copied; the next tick waits only if main is late at a conflict |
| A terminal tail on main, late at a conflict | a copy of the declared struct reads of its passing rows; the world's thread goes on |
| Commands from a worker kernel or joined thread | ring writes; no message |
| `run` from a joined thread | one ring entry and notify; resolves through a word |
| Struct observers on a joined thread, per tick | candidate check on the world's thread, a mailbox write of changed results, one notify |
| Structural change touching archetypes with objects on other threads | one log entry per row moved, replayed once on that thread |
| Despawning entities with finalizers on other threads | stop-list copy of declared reads; the world's thread doesn't wait |
| A transferred asset | one message, loader to its thread; one command |

## Memory

- **Directory:** a record per archetype, 16 bytes plus 32 bytes per storage.
- **Rings:** per thread, a task ring as the pool's, and a command ring sized to the largest tick's commands, grown at sync points.
- **Move log:** 16 bytes per entry, up to each thread's row count; 8 bytes per row of the archetypes it holds objects of, for its entity column.
- **Mailboxes:** three slots per observing thread, each sized to the largest result delivered.
- **Tail buffers:** only once a fallback snapshot was taken: passing rows times their declared struct reads, kept for the next.
- **Stop lists:** per stop, the entity, its row and its declared struct reads.

## Phases

Each phase leaves the package shippable with every test passing, and starts interface first: type changes with red
then green type tests, then runtime with red then green runtime tests. Each phase ends with `pnpm perf --record` and
`pnpm perf:browser --record`; listed benchmarks must not regress beyond noise.

### Built: threads in declarations, and the loop

- `Threads`, `thread`, `transfer` and the DOM rule in types, with registration's checks; a system's and finalizer's
  thread derived, and two threads rejected, when declared. With every thread filled by `world`, nothing changes at
  runtime.
- The loop, inline: `add`, `cadence` with `maxSteps`, `always`, `wake`, `clock`, `report`, beats on animation frames or
  timers, and the `workers` resource sizing the pool at sync points.
- `share` and `World.join` are typed, with `threadPort`, `threadClaims` and `threadStatus`, and throw as not yet
  supported.

### Phase 1: shared layout directory

Workers read archetype layout from the directory; `publish.ts` posts only new components and archetypes; lookup
directories reuse its records.

- Interface: none. Contract: none.
- Tests: the existing worker browser tests; a test that grows 100 archetypes across sync points and checks workers' kernels see every row, with no layout message after the first.
- Must not regress: `sync point one spawn`, `run idle`, `run 50 idle`, `create`, `churn`, `move workers`, `follow workers`, `chain workers`, `up depth 10 workers`.
- New: `sync point grow 100 archetypes` (one spawn into each of 100 full archetypes per sync point, workers on), node and browser.

### Phase 2: thread ports and node workers

`pool.ts` takes a port abstraction over browser `Worker` and node `worker_threads`, so real-thread tests run in node,
and pool workers can be nested workers of a world on a worker, or ports the main thread passes.

- Interface: none. Contract: none.
- Tests: the worker browser tests' cases run again in node with `worker_threads`; a dead-worker test in both.
- Must not regress: every `workers` benchmark.
- New: `move workers` and `follow workers` in node; `wake` (a notify from the world's thread to a waiting worker and back, N = 10,000).

### Phase 3: command rings for the pool

Worker kernels write commands into their thread's ring, with merge tags; `FromWorker` carries no commands.

- Interface: none. Contract: none.
- Tests: deterministic merge across worker counts 0, 1, 2 and 7, compared row for row; ring growth across sync points.
- Must not regress: `emit`, `churn`, `sync point one spawn`.
- New: `emit workers` (a kernel spawning 1 per row over 1M rows, then despawning them).

### Phase 4: joining

`share`, `World.join`, the handshake through the thread's entity, remote `run` through command rings and completion
words, struct observers through mailboxes, the structure epoch. Every logical thread is still filled by `world`.

- Interface: none beyond what's typed.
- Contract: the first notification on a joined thread always comes later; `observe.entity(entity)` on a joined thread gives struct components plus that thread's objects; `share` and `join` stop throwing.
- Tests: node and browser, the world on a worker with main joined, and the reverse; observers of resources, entities, select and count; a joined thread that dies leaves its systems in `skipped` with a `"thread"` failure, and `threadStatus` `"gone"`; no cross-origin isolation throws at `share` and `join`.
- Must not regress: `run idle`, `select`, `sync point one spawn`.
- New: `remote run` (an empty transaction from a joined thread, N = 1,000); `mailbox resource` (one observed resource changed per tick, N = 1,000 ticks); `mailbox select 10K` (a `select` over 10,000 entities whose order changes every tick).

### Phase 5: objects on other threads

Object columns by row on their thread, staged slots, the move log with replay and rebuild, blocking tiers through task
rings with fusion, observers of objects on their thread, finalizers on other threads with stop lists and index reuse
gated on acknowledgement.

- Interface: finalizers that read objects of another thread lose `commands` and resource writes, type-tested.
- Contract: such finalizers run after the sync point, under the guarantee above.
- Tests: a property test of random spawns, despawns, adds and removes on archetypes holding objects on another thread, comparing that thread's values with an inline world's after every tick, with the log forced to drop; finalizers run once per stop, before index reuse; a main thread that never yields doesn't stall ticks that don't touch it.
- Must not regress: every benchmark, inline.
- New: `handoff` (10 tiers alternating `world` and a joined worker, empty systems, N = 1,000 ticks); `fused tiers` (10 consecutive tiers on a joined worker); `log replay` (10,000 swap-removes and moves per sync point, time per move); `log rebuild 100K` (a forced rebuild over 100,000 rows); `despawn objects 10K`.

### Phase 6: tails

Terminal systems scheduled across the tick boundary, waits only at conflicts, fallback snapshots when a tail is late.

- Interface: `warnings` in `World.Report`, type-tested.
- Contract: a tick's report includes its tails' failures.
- Tests: a terminal main system over 1,000 rows while the world ticks continuously, checking that every tail sees one tick's values, whether read in place or from a snapshot; a prompt main never snapshots; a tail that throws is in its tick's report.
- Must not regress: `run idle`, `move main`, `main thread`, `loop tick idle`.
- New: `loop tick idle` (a tick with nothing changed, N = 10,000); `tail prompt` (the next tick's start latency with a 1,000-row main tail that finishes in time, N = 1,000 ticks); `tail late snapshot 10K` (a late tail of 10,000 passing rows of a vec3 and a mat4, the copy's cost).

### Phase 7: transfers

Transfer components and acknowledgements. A sample runs the world on a worker with an OffscreenCanvas and the DOM on
main, and a loader worker transferring decoded textures.

- Interface: type tests for `transfer` commands from another thread.
- Contract: none beyond the guarantee above.
- Tests: browser only; a transfer whose acknowledgement arrives late carries its command to a later sync point.
- Must not regress: `up depth 10 gpu`, `up depth 1000 gpu`.
- New: `transfer` (a 1 MB ArrayBuffer and a 1024 by 1024 ImageBitmap, loader to its thread, N = 100).

## Not built

- **Several loops per world,** such as fixed-step physics beside rendering.
- **Overlapping ticks by access sets:** starting tick N+1's tiers that don't conflict with tick N's, beyond tails. Ticks with independent halves would justify it.
- **Per-component write epochs** for read-only readers outside the schedule of large struct data; they shrink the conflict window without closing it.

## Not planned

- **A GPU thread:** the device lives with the world, so GPU tiers and readbacks never cross threads.
- **Copying objects between threads,** or snapshots of them: objects stay on their thread.
- **A seqlock over whole runs for observers:** back-to-back ticks starve readers, and every reader thread would evaluate queries again.
- **Double-buffered columns:** twice the memory and a copy of every written column per tick, or front and back swaps per tier.
- **Snapshots on every tail:** a prompt main would copy every tick for nothing.
- **Objects by entity index,** dense or as a sparse set: memory by index space, or a load per row.
- **A shared heap for asset payloads:** `WebAssembly.Memory` never shrinks, `TextDecoder` rejects shared views, and an `ImageBitmap` isn't bytes.
- **Several world threads, or moving one:** merges stop being deterministic, and plan and finalizer state would have to migrate.
- **Inferring threads from values:** it fails late, and a worker can't test for DOM types.
- **Remoting through a JS Proxy.**
