# Running one world across threads

How one world runs across the main thread and workers: which thread owns structure, where values that aren't data live, how systems and observers on other threads stay consistent without stalling the coordinator, and the phases that build it. Referenced from `design.md`.

"Place" and `World.join` are working names (open: "home" and `connect`); renaming them is mechanical.

## Model

- **One coordinator per world.** The thread that calls `World.create` runs the loop, every sync point (plan, finalize, apply), byte observers and the kernel pool. Any thread can be the coordinator; it's fixed for the world's life.
- **One loop per world.** The world runs one cyclic schedule whose end flows into its next start: a tick. Scheduling applies across the boundary, so tails at the end of tick N sit just before the head of tick N+1.
- **Byte values live in shared memory and have no place.** Numbers, vectors, structs, booleans and entities: columns, ticks, the entity table and resource cells of byte type, all in the arena (`memory.ts`), readable and writable from any thread the schedule gives them to.
- **Values that aren't data have a place.** Each object component and object resource (DOM nodes, GPU objects, functions, strings, arrays, plain objects) lives on one place, and only that place's thread reads or writes it. Values are never copied between threads. A component declared `transfer: true` may be moved, never copied, to its place.
- **Places are roles, bound to threads by the application.** Libraries declare places on components; only `World.create` binds them.
- **Inline is the same layout.** With every place on one thread, storage and code paths are those of today; nothing below adds work to a one-thread world.

## Interface

```ts
// Augmentable, as Components and Resources are. Built in:
export interface Places {
    coordinator: true;  // the thread that created the world
    main: true;         // the window's thread, detected, never bound
    gpu: true;          // gpuDevice's place; unbound, so on the coordinator
}

// Only on declarations without `type`; a data declaration with `place` fails in types and at registration.
Component.register(domNode, { place: "main" });
Component.register(textureSource, { place: "gpu", transfer: true });
// A declaration without `place` is on "coordinator".

declare module "@adobe/data-ecs" {
    interface Components {
        // A value type extending DOM `Node` requires `place: "main"`; the check resolves to no requirement where
        // the DOM library isn't loaded.
        [domNode]: { type: HTMLElement; place: "main" };
        // `transfer: true` requires a Transferable type: ArrayBuffer, ImageBitmap, VideoFrame, OffscreenCanvas, MessagePort.
        [textureSource]: { type: ImageBitmap; place: "gpu"; transfer: true };
    }
}

// On the coordinator. Places left out are on this thread, except "main", which is always the window's thread.
World.create(options?: {
    readonly places?: { readonly [P in Exclude<Place, "coordinator" | "main">]?: MessagePort | Worker };
    readonly resources?: InitialResources;
}): World;

// On any other thread, after importing the modules whose systems, observers and finalizers run there.
World.join(port: MessagePort | DedicatedWorkerGlobalScope | Worker): World;
```

`World.join` returns the same `World` type. Its `run` and `observe` work as on the coordinator. Its `dispose` disconnects this thread; disposing on the coordinator disposes the world.

Still open: whether the loop and its pacing are given by `world.loop(system, pacing)` or at `World.create`; how loop failures surface (one candidate is `observe.report: Observe<Report>`); and how a system asks for a wake time (a `wakeAt` command, or a resource).

## Placement rules

All derived from declarations at registration; none is a flag.

- **A system's place** is the place of every object component and object resource it names in `read`, `write`, `added`, `changed`, `lookup` and `up`. Components in `has` and `not`, and resources in `is` and `not`, are structural or read a shared presence word, so they don't place it. With no placed names, a kernel runs on the pool and a non-kernel system on the coordinator. Render systems and `kernel: "gpu"` systems are on `gpuDevice`'s place.
- **Errors at registration:** two places in one system; a place whose thread hasn't imported the system (checked by name, once); `main` used with no main thread joined.
- **A terminal system** writes only object components and object resources of its own place, issues no commands, writes no byte component or byte resource, and looks up no byte component. DOM-writing systems and render systems are terminal. A terminal system on another thread runs as a tail (see Tails). A non-terminal system on a thread other than the coordinator is a blocking tier, and the tick's report lists it under a new `warnings` entry.
- **Observers:** one that names object components of a place other than its thread's throws at subscribe. A byte-only observer is evaluated on the coordinator. One that names its own place's object components is evaluated on its thread.
- **Finalizers** that read placed components run on that place. Their context has no `commands` and no resource writes, in types and at registration, and `before`/`after` across places is a registration error.

## Mechanisms

### The loop

- **Pacing.** Continuous: each frame with `requestAnimationFrame` on the coordinator's thread, or a fixed step. Or on demand: the loop goes quiet at no idle cost, with workers parked in `Atomics.wait`, and a tick starts only on an explicit wake.
- **Wakes.** Only two things wake a quiet loop:
  1. Commands arriving from any thread: events, loaders, transfers.
  2. A wake time a system asks for, for timers and animations.

  "The last tick wrote something" is never a wake, since the clock writes every tick.
- **`run(system, input)`** stays as the API for user transactions. Proposed, still open: a one-off run lands in the tick in progress, after its last tier that isn't terminal and before its tails, so tails such as render or DOM see it the same frame.
  - If the tick has already reached its tails, or the loop is quiet, the run lands at that point of the next tick. In quiet mode it wakes a tick.
  - Several runs land in call order per thread, with merge tags across threads.
  - The promise resolves when that tick finishes, so runs in flight resolve in order.
- **Observers** deliver at the end of each tick. A quiet loop delivers nothing.
- **A dead thread** doesn't reject. The tick resolves with that thread's systems in `skipped` and a failure in the report.

### Shared layout directory

Per archetype in the arena: `count`, `capacity`, the `entities` offset, and per storage its column, tick and chunk-tick offsets. The coordinator keeps its JS fields as the source of truth on its hot paths and writes each record only at sync points, for archetypes created, grown or whose count changed. Every other thread indexes whole-buffer typed views (`u8`, `u32`, `i32`, `f32`, `f64` over `memory.buffer`) by those offsets, rebuilding the views only when a shared byte-length word moves. Only new components (schemas) and new archetypes (sorted component ids) are posted. This replaces `publish.ts`'s layout broadcast and the per-lookup directories' archetype records.

### Task rings

The pool's ring (`pool.ts`, `protocol.ts`) generalized to every thread. Pool workers are nested workers of the coordinator by default; the main thread may create them and pass their ports instead. Each ring has posted, done, epoch and signal words on their own cache lines, plus payload words: task kind, system index, tick, `lastRun`, input offset, and **the sync number the task needs replayed through**. Workers wait in a window with `Atomics.wait`. The main thread can't block: it waits with `Atomics.waitAsync`, or a posted message where that's unavailable. Consecutive tiers whose systems are all on one thread go as one task, with no barrier between them.

### Command rings

One ring per thread in shared memory, with that thread as its only writer, drained by the coordinator at the sync point. Each block carries a merge tag (tier, system index, chunk index), so the merge order never depends on which thread ran a chunk. Byte values are written through each component's layout writer. An object value of the issuing thread's own place stays on that thread in a staging array; the ring carries its slot number. Worker kernels write their commands here instead of posting `CommandBuffer`s back. `run(system, input)` from another thread writes an entry, encoding byte-schema input through its schema; input that isn't bytes is structured-cloned, as a command is. The entry lands as the loop places one-off runs. `run` resolves through a completion word, and the report is posted only when it isn't clean.

### Placed object columns

By row on their place's thread, exactly as `storage.values[row]` is today, so iteration costs nothing more. Placed components' `added` and `changed` ticks live beside them on that thread, by row, so writes and stamps there touch nothing shared.

**The move log.** For archetypes containing a component placed off the coordinator, apply appends, in apply order: `move(fromArchetype, fromRow, toArchetype, toRow)`, `swap(archetype, lastRow, row)`, `append(archetype, row, slot)`, `set(archetype, row, component, slot)`, and range forms for bulk operations, 16 bytes each, tagged by sync number. The place's thread replays lazily: before a task whose payload names sync S, or an observer evaluation, it processes each pending sync in order: its finalizers first, against values still at their pre-apply rows, then its log. A staged slot that no entry of sync S names was dropped, and is cleared without a finalizer. The log holds at most the place's row count of entries, at least 4096; past that it drops them, and a thread behind rebuilds: it keeps an entity column per placed archetype (8 bytes a row, updated by replay), maps index to value from its old rows, and refills from the shared `entities`.

### Placed finalizers

Before apply, the coordinator writes a per-place stop list: each stopped entity, its pre-apply archetype and row, and a copy of the byte components the finalizer declares in `read`. The place's thread runs its finalizers when it next processes that sync, in declared order within the place, then stores "finalized through sync N". The guarantee: each placed finalizer runs exactly once per stop, on its place, before that place's next task or observer evaluation after the sync point and before the entity's index is reused, seeing its declared byte reads and its place's values as of before apply. Indexes whose entities had placed finalizers return to the free list only after their places acknowledge.

### Byte observers and mailboxes

A remote thread posts its query once at subscribe; the first value comes later, as `Observe` allows. At the end of each tick, the coordinator runs the cheap candidate check it runs today (`observers.ts`) and writes each changed result into that thread's mailbox: a triple buffer in shared memory (three slots, the latest index swapped with `Atomics.exchange`), so the writer never waits and the reader takes the newest complete slot. Results carry resource cells, listed entity components, or the entity list of `select`; never strings or objects. One `Atomics.notify` per thread per tick with deliveries. A whole-entity observer (`observe.entity(entity)` without options) on a thread gives byte components and that thread's place's components.

### Structure epoch

One shared word, odd only while apply runs. Threads that read entity locations outside a task, observers of placed components, read while it's even and check it again after, retrying on a change. Apply is short, so readers don't starve. Values are never guarded by it: scheduled reads are ordered by tiers, and observers read published results.

### Tails

Tails at the end of tick N sit just before the head of tick N+1, and ordinary scheduling applies across that boundary. A tier in N+1 that writes what a tail reads waits for the tail's reads, which end when its body ends; nothing else waits. A sync point counts as a write to everything a tail reads.

- **Fallback snapshot.** Sometimes a conflicting writer in N+1 is ready before the tail has finished its reads, as when main is late. The coordinator then copies the declared byte reads of the tail's passing rows, with their entities, into a tail buffer and goes on; the tail reads the copy. The values are the same either way, so this stays deterministic. A prompt main never copies.
- **The tail's own place's values** are read in place. The next sync point's moves wait in the log until the tail finishes.
- **Render tails off the coordinator** upload their storages' dirty rows as their first read; recording and submitting follow without blocking anything.
- **Report.** A tick resolves after its tails, so their failures are in its report.

### GPU off the coordinator

The `gpu` place's thread owns the `GpuEngine`. CPU tiers that read storages ahead on the GPU, and sync points that disturb them, wait for its readback through its task ring. Readback for observers is asynchronous: the gpu thread copies into the shared column and stores a per-storage `validThroughRun`; the coordinator publishes observers of that storage once it's reached, so their notifications lag by the readback, and nothing waits. Binding `gpu` to the coordinator's thread removes every one of these waits; tests, samples and the guide do that.

### Transfers

A `transfer: true` value set from another thread is posted with its transfer list straight to its place's thread, on a channel the world sets up between joined threads, keyed by slot. The command carrying that slot applies at the first sync point after the place acknowledges receipt; until then it carries to the next, so the coordinator never waits on delivery.

### Without cross-origin isolation

Memory isn't shared, so the world runs inline: places bound to other threads throw at `World.create`, and `World.join` throws.

## Cost

| Common operation | Cost |
|---|---|
| Iterating rows, byte or object, on any thread | as today: no added load per row |
| A quiet loop | nothing: no tick, no delivery, workers parked |
| A one-off `run` | lands in the tick in progress or the next; no tick of its own |
| A sync point with growth, other threads joined | one directory record per changed archetype; a message only for new archetypes or components |
| A tier on a thread other than the coordinator | one ring post and notify, one done-counter wait; consecutive tiers on that thread are one |
| A blocking tier on main | main's event-loop latency, which the report warns about |
| A terminal tail on main, prompt | one post; nothing copied; the next tick waits only if main is late at a conflict |
| A terminal tail on main, late at a conflict | a copy of the declared byte reads of its passing rows; the coordinator goes on |
| Commands from a worker kernel or joined thread | ring writes; no message |
| `run` from a joined thread | one ring entry and notify; resolves through a word |
| Byte observers on a joined thread, per tick | candidate check on the coordinator, a mailbox write of changed results, one notify |
| Structural change touching placed archetypes | one log entry per row moved, replayed once on the place's thread |
| Despawning entities with placed finalizers | stop-list copy of declared reads; the coordinator doesn't wait |
| A transferred asset | one message, loader to place; one command |
| Observers of GPU-written columns, GPU off the coordinator | readback latency, no wait |

## Memory

- **Directory:** a record per archetype, 16 bytes plus 32 bytes per storage.
- **Rings:** per thread, a task ring as the pool's, and a command ring sized to the largest tick's commands, grown at sync points.
- **Move log:** 16 bytes per entry, up to each place's row count; 8 bytes per row of placed archetypes for its entity column.
- **Mailboxes:** three slots per observing thread, each sized to the largest result delivered.
- **Tail buffers:** only once a fallback snapshot was taken: passing rows times their declared byte reads, kept for the next.
- **Stop lists:** per stop, the entity, its row and its declared byte reads.

## Phases

Each phase leaves the package shippable with every test passing, and starts interface first: type changes with red then green type tests, then runtime with red then green runtime tests. Each phase ends with `pnpm perf --record` and `pnpm perf:browser --record`; listed benchmarks must not regress beyond noise.

### Phase 1: shared layout directory

Workers read archetype layout from the directory; `publish.ts` posts only new components and archetypes; lookup directories reuse its records.

- Interface: none. Contract: none.
- Tests: the existing worker browser tests; a test that grows 100 archetypes across sync points and checks workers' kernels see every row, with no layout message after the first.
- Must not regress: `sync point one spawn`, `run idle`, `run 50 idle`, `create`, `churn`, `move workers`, `follow workers`, `chain workers`, `up depth 10 workers`.
- New: `sync point grow 100 archetypes` (one spawn into each of 100 full archetypes per sync point, workers on), node and browser.

### Phase 2: thread ports and node workers

`pool.ts` takes a port abstraction over browser `Worker` and node `worker_threads`, so real-thread tests run in node, and pool workers can be nested workers of a coordinator on a worker, or ports the main thread passes.

- Interface: none. Contract: none.
- Tests: the worker browser tests' cases run again in node with `worker_threads`; a dead-worker test in both.
- Must not regress: every `workers` benchmark.
- New: `move workers` and `follow workers` in node; `wake` (coordinator notify to a waiting worker and back, N = 10,000).

### Phase 3: command rings for the pool

Worker kernels write commands into their thread's ring, with merge tags; `FromWorker` carries no commands.

- Interface: none. Contract: none.
- Tests: deterministic merge across worker counts 0, 1, 2 and 7, compared row for row; ring growth across sync points.
- Must not regress: `emit`, `churn`, `sync point one spawn`.
- New: `emit workers` (a kernel spawning 1 per row over 1M rows, then despawning them).

### Phase 4: places in declarations

`Places`, `place`, `transfer`, the DOM conditional type; system placement derived at registration and every placement error; placed components' ticks kept by their place. With every place on one thread, nothing changes at runtime.

- Interface: type tests that `place` is rejected on data declarations, required for `Node` types where DOM types exist, `transfer` requires a Transferable type, placed finalizers' contexts lack `commands` and resource writes.
- Contract: "values that aren't data are main-thread only" becomes "on their place"; placed finalizers lose `commands` and resource writes; cross-place finalizer ordering is rejected.
- Tests: registration errors as data at the boundary (two places, unimported, no main); inline worlds with places give the same results as without.
- Must not regress: the whole node suite.

### Phase 5: the loop

One cyclic schedule per world, inline: continuous pacing (`requestAnimationFrame` or a fixed step) and on demand, explicit wakes, one-off `run`s landing before the tick's tails, observers delivering at the end of each tick, a dead thread reported as `skipped` plus a failure. Opens with deciding the loop's interface (above).

- Interface: the loop and pacing, how loop failures surface, and the wake time a system asks for, each type-tested.
- Contract: a world runs one loop; `run` lands in a tick instead of running alone, and resolves when that tick finishes, in order; observers notify at the end of each tick, and "all of a run's notifications before `run` resolves" is dropped; a dead thread no longer rejects a run.
- Tests: a quiet loop runs no tick and delivers nothing; a command or a requested wake time starts exactly one tick; runs issued during a tick land before its tails, and those issued after them land in the next; the clock's own writes never wake a quiet loop.
- Must not regress: `run idle`, `run 50 idle`, `sync point one spawn`, `move 1K`, `main thread 1K`.
- New: `loop tick idle` (a tick with nothing changed, N = 10,000); `run into tick` (100 one-off runs landing in one tick); `quiet wake` (a command waking a quiet loop to its first tier, N = 1,000).

### Phase 6: joining

`World.join`, the handshake, remote `run` through command rings and completion words, byte observers through mailboxes, the structure epoch. Every place is still on the coordinator.

- Interface: `World.create({ places })`, `World.join`; type tests that the joined world has the `World` type.
- Contract: the first notification on a joined thread always comes later; `observe.entity(entity)` on a joined thread gives byte components plus that thread's place's components.
- Tests: node and browser, coordinator on a worker with main joined, and the reverse; observers of resources, entities, select and count; a joined thread that dies leaves its systems in `skipped`; no cross-origin isolation throws at create for bound places and at join.
- Must not regress: `run idle`, `select`, `sync point one spawn`.
- New: `remote run` (an empty transaction from a joined thread, N = 1,000); `mailbox resource` (one observed resource changed per tick, N = 1,000 ticks); `mailbox select 10K` (a `select` over 10,000 entities whose order changes every tick).

### Phase 7: places on other threads

Placed columns by row on their thread, staged slots, the move log with replay and rebuild, blocking tiers through task rings with fusion, placed observers, placed finalizers with stop lists and index reuse gated on acknowledgement.

- Interface: none beyond Phase 4.
- Contract: placed finalizers run after the sync point, under the guarantee above.
- Tests: a property test of random spawns, despawns, adds and removes on placed archetypes, comparing the place's values with an inline world's after every tick, with the log forced to drop; finalizers run once per stop, before index reuse; a main thread that never yields doesn't stall ticks that don't touch it.
- Must not regress: every benchmark, inline.
- New: `handoff` (10 tiers alternating coordinator and a joined worker, empty systems, N = 1,000 ticks); `fused tiers` (10 consecutive tiers on a joined worker); `log replay` (10,000 swap-removes and moves per sync point, time per move); `log rebuild 100K` (a forced rebuild over 100,000 placed rows); `despawn placed 10K`.

### Phase 8: tails

Terminal systems scheduled across the tick boundary, waits only at conflicts, fallback snapshots when a tail is late, render tails' uploads as their first read.

- Interface: `warnings` in `World.Report`, type-tested.
- Contract: a tick's report includes its tails' failures.
- Tests: a terminal main system over 1,000 rows while the coordinator loops continuously, checking that every tail sees one tick's values, whether read in place or from a snapshot; a prompt main never snapshots; a tail that throws is in its tick's report.
- Must not regress: `run idle`, `move main`, `main thread`, `loop tick idle`.
- New: `tail prompt` (the next tick's start latency with a 1,000-row main tail that finishes in time, N = 1,000 ticks); `tail late snapshot 10K` (a late tail of 10,000 passing rows of a vec3 and a mat4, the copy's cost).

### Phase 9: GPU off the coordinator, and transfers

The gpu place on its own thread, `validThroughRun`, render tails; transfer components and acknowledgements. A sample runs the coordinator and GPU on one worker with an OffscreenCanvas and DOM on main, and a loader worker transferring decoded textures.

- Interface: type tests for `transfer` commands from another thread.
- Contract: observers of GPU-written columns may lag by readback when the GPU is off the coordinator.
- Tests: browser only; GPU readback ordering against CPU tiers; a transfer whose acknowledgement arrives late carries its command to a later sync point.
- Must not regress: `up depth 10 gpu`, `up depth 1000 gpu`.
- New: `transfer` (a 1 MB ArrayBuffer and a 1024 by 1024 ImageBitmap, loader to place, N = 100); `gpu readback observer` (one observed GPU-written column of 10,000 rows, notification latency in ticks).

## Decisions for the user

1. **Where a one-off `run` lands:** proposed, before the tick's tails, else at that point of the next tick.
2. **The loop's interface:** `world.loop(system, pacing)` or the loop and pacing at `World.create`.
3. **How loop failures surface:** one candidate is `observe.report: Observe<Report>`.
4. **How a system asks for a wake time:** a `wakeAt` command, or a resource.
5. **Names:** "place" or "home"; `World.join` or `connect`.

## Not built

- **Several loops per world,** such as fixed-step physics beside rendering. One loop per world to start.
- **Overlapping ticks by access sets:** starting tick N+1's tiers that don't conflict with tick N's, beyond tails. Ticks with independent halves would justify it.
- **Per-component write epochs** for read-only readers outside the schedule of large byte data; they shrink the conflict window without closing it.

## Not planned

- **Copying strings, arrays or objects between threads,** or snapshots of them: values stay on their place.
- **A world on main with the GPU as a remote executor:** a round trip per GPU tier and per readback, inside sync points too.
- **A seqlock over whole runs for observers:** back-to-back ticks starve readers, and every reader thread would evaluate queries again.
- **Double-buffered columns:** twice the memory and a copy of every written column per tick, or front and back swaps per tier.
- **Snapshots on every tail:** a prompt main would copy every tick for nothing.
- **Placed values by entity index,** dense or as a sparse set: memory by index space, or a load per row.
- **A shared heap for asset payloads:** `WebAssembly.Memory` never shrinks, `TextDecoder` rejects shared views, and an `ImageBitmap` isn't bytes.
- **Several coordinators, or moving one:** merges stop being deterministic, and plan and finalizer state would have to migrate.
- **Inferring places from values:** it fails late, and a worker can't test for DOM types.
- **Remoting through a JS Proxy.**
