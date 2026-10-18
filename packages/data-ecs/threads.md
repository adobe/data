# Running one world across threads

How one world runs across the main thread and workers: which thread owns structure, where objects live, how systems
and observers on other threads stay consistent without stalling the world's thread, and the phases that build it.
Referenced from `design.md`.

## Terms

- **Struct:** numbers, booleans, entities, fixed-length tuples and structs of those. A struct has a fixed size and
  lives in shared memory: columns, ticks, the entity table and resource cells of struct type, all in the arena
  (`memory.ts`), readable and writable from any thread the schedule gives them to. A struct has no thread.
- **Object:** every other value: strings, variable-length arrays, plain objects, and values that aren't data, declared
  with `Component.object<T>()` (DOM nodes, GPU objects, functions). Each object component and object resource lives on
  one logical thread, and only the thread filling it reads or writes it. Objects are never copied between threads; one
  declared `transfer: true` may be moved, never copied.
- **Logical thread:** a name in the augmentable `Threads` interface. `world` and `main` are built in. A joined thread
  fills the logical threads it claims; the world's thread fills every one no joined thread claims.
- **Remote:** an object component, resource, system or finalizer whose logical thread a joined thread fills. Only
  remote ones pay for anything below; an object of `main` in a world on the main thread isn't remote.

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
- **Keys are symbols,** so components, resources and traits never collide, but a symbol is a different value on each
  thread. Threads agree on keys through the ids the plugin gives top-level `Symbol(...)` declarations, by which the
  registry already takes the symbols of one id as one key; a threaded world will reject a key without one, at
  registration or first use. Ids name packages, not directories, so threads bundled apart agree on them, and the
  plugin adds itself to `worker.plugins`, so worker bundles' keys get them too.
- **Systems, rules and finalizers are their values,** and names are optional labels, so a value is different on each
  thread too. Threads agree on them through the ids the plugin gives top-level `System.create`, `System.render`,
  `Rule.create`, `Finalizer.create` and `Finalizer.changes` bindings, composites included, by which the registry
  already takes values of one id as one item. A threaded world rejects an item without one where it crosses threads:
  a system or finalizer placed on a joined thread, and a system a joined thread runs, at join or at that run; a
  composite crosses only if every member has an id. Rules run only at `world`'s sync points, so they never cross. A
  kernel crosses as its chunk's url and the world's index for it, as pool workers load it now; kernel chunks keep
  their exports' signatures, so every thread's import finds them.
- **Threads number what crosses locally.** A joined thread gives each key and item it sends its own number, and posts
  the id once by message the first time; the world maps (thread, number) to its own. The world holds ring entries
  that use a number it can't map yet, in order, until that message arrives. A run of an id the world never imported
  rejects.
- **Archetypes are lists of keys.** The index `Archetype.create` gives a list is for its own thread's lookups;
  threads agree on an archetype through the world's numbers for its components. Commands and staged spawn batches
  carry those numbers, never archetype indexes.
- **Inline is the same layout.** With every logical thread filled by the world's thread, storage and code paths are
  those of today; nothing below adds work to a one-thread world.

## Interface

```ts
// Augmentable, as Components and Resources are. Built in:
export interface Threads {
    world: true;   // the thread that created the world
    main: true;    // the window's thread, where the DOM is
}

// A value that isn't data states its type. A DOM Node lives on "main", and says so; the check resolves to no
// requirement where the DOM library isn't loaded.
const domNodeTraits = Component.register(domNode, { type: Component.object<HTMLElement>(), thread: "main" });
// `transfer: true` requires a Transferable type: ArrayBuffer, ImageBitmap, VideoFrame, OffscreenCanvas, MessagePort.
// It lives on `world`, where the GPU uploads it; a loader thread sets it by moving the value there.
const textureSourceTraits = Component.register(textureSource, { type: Component.object<ImageBitmap>(), transfer: true });
// `thread` only on objects: a struct with `thread` fails in types and at registration.
declare module "@adobe/data-ecs" {
    interface Components {
        [domNode]: typeof domNodeTraits;
        [textureSource]: typeof textureSourceTraits;
    }
}

// Planned, not public yet. On the thread that will hold the world:
const world = World.create(resources?);
const thread = world.share(port);   // lets another thread join through the port; returns that thread's Entity

// On another thread, after importing the modules whose systems, observers and finalizers run there.
const joined = World.join(port, { threads: ["main"] });   // a MessagePort, or a worker's own scope
```

`World.join` returns the same `World` type. Its `run` and `observe` work as on the world's thread, and its `dispose`
disconnects this thread; disposing on the world's thread disposes the world. `share` reserves the thread's entity and
stages its spawn for the next sync point, which it makes due; the entity's read-only status components show the
joined thread's progress (`"joining"`, `"joined"`, `"gone"`) and the threads it claims. Only the world writes them:
a system that writes them fails at registration. The port stays internal.

**Planned, not public:** `share`, `World.join` and `World.Port` join the interface in the joining phase below.

## Placement rules

All derived from declarations and, for terminal systems, the plugin's analysis of their bodies; none is a flag.

- **A system's thread** is the thread of every object component and object resource it names in `read`, `write`,
  `added`, `changed`, `lookup`, `up` and resource `is`. Components in `has` and `not` are structural, and read a shared
  presence word, so they don't place it. With no objects, a kernel runs on the pool and any other system on `world`.
  Render systems and `kernel: "gpu"` systems are on `world`, with `gpuDevice`.
- **Errors when declared:** objects of two threads in one system or finalizer, in types and when it's created, which
  registers it. **Errors when joining:** a thread claimed twice; a claimed thread whose systems or finalizers that
  joined thread hasn't imported (checked by id, once), or one of them without an id.
- **A terminal system** writes only objects of its own thread, issues no commands, writes no struct component or
  struct resource, and looks up no struct component. Commands are in every non-GPU system's context, so "issues no
  commands" is what the plugin proves from the body, as it checks main-thread bodies' keys: a body that never reaches
  `commands`. A system the plugin can't prove is not terminal. A terminal system's context has no `commands`. DOM-writing
  systems and render systems are terminal. A remote terminal system runs as a tail (see Tails). A non-terminal remote
  system is a blocking tier, and the tick's report lists it under `warnings`.
- **Observers:** one that names objects of a thread other than its own throws at subscribe. A struct-only observer is
  evaluated on `world`. One that names its own thread's objects is evaluated on its thread.
- **Finalizers** that read remote objects run on their thread. Their context has no `commands` and no resource writes,
  in types and at creation; they can't declare `lookup`, and `Finalizer.changes` can't be remote, both rejected at
  creation; `before`/`after` across threads is an error at creation.
- **Values for another thread's objects:** a command issued on one thread may give an object component of another
  thread only its start or `null`, as tags the owning thread resolves. Any other value fails the command when it's
  issued. `transfer` components are the exception (see Transfers).

## Mechanisms

### The loop

- **Cadence.** `frame` beats on `requestAnimationFrame` where the world's thread has it, and on a timer otherwise;
  `fixed` beats every `step` milliseconds, running at most `maxSteps` ticks when behind and dropping the rest.
- **Ticks and wakes.** A beat ticks only where `always` is set, `wake` (a reduced resource, `"min"`) is due, or a run
  arrived since the last tick. A quiet loop schedules nothing, and a fixed loop builds no debt while quiet. The
  clock's own writes never wake it.
- **The loop host** (`frame`, `timer`, `now`) can be given in `WorldOptions`, for tests and benchmarks. A back-to-back
  driver, `backToBack()`, gives a `frame` that calls back through a `MessageChannel` post: a task, so worker messages and `waitAsync`
  settle between ticks, which a microtask would starve, and unclamped, as `setTimeout(0)` isn't.
- **`run(system, input)`** is a transaction: runs are sequential in call order, each its own sync point, and each one
  makes the next beat tick.
- **Failures of ticks** are in the `report` resource. A thread that dies doesn't reject a run or a tick: its systems
  are in `skipped`, with a `"thread"` failure, a kind `World.Report` gains in phase 5b.
- **Observers** notify after each run or tick that changed what they observe; nothing promises a notification before
  `run` resolves. A quiet loop delivers nothing.

### Shared layout directory

- **Header:** the arena's first block, at offset 0, allocated with the memory, which never moves. It holds the
  memory's length in pages, the base offset and length of the archetype table, and the entity table's record. Its
  offset travels in the `memory` message, to every pool a world starts.
- **Length:** `memory.ts` stores it in pages, since 4 GiB in bytes doesn't fit a `Uint32`, with `Atomics.store` right
  after each `memory.grow`. A thread loads it at the start of each task, rebuilds its whole-buffer view of words over
  `memory.buffer`, which serves the header and records, when it moved, and checks `memory.buffer.byteLength` covers
  it. If it doesn't, the thread marks itself broken, as a failed layout does, and fails every later task, since typed
  arrays read out of bounds as `undefined` and drop such writes silently.
- **Archetype records:** the table holds, by the world's archetype number, the offset of that archetype's record. Each
  record is allocated once, since an archetype's storages are fixed, and never moves; only the table grows. A record
  holds `capacity`, the `entities` offset and a version, and per storage its component number, its flags (`ticked`,
  linear), its column, tick and chunk-tick offsets and its chunk count. Offsets are `Uint32`, since memory reaches
  4 GiB. The resource archetype has a record too, flagged, from phase 4.
- **Entity-table record:** the `cursor` offset, which never moves, the free list's offset and capacity, the
  `archetype`, `row` and `generation` offsets and capacity, and a version. The table's length is `cursor[2]`. Its
  arrays move whenever they grow, even without memory growing, since a grown array's old block is reused.
- **Writes:** the world's thread keeps its JS fields as the source of truth on its hot paths. Growth and `startTicks`
  bump an archetype's version and append it to a list of bumped archetypes; table growth in `materialize` and
  `recycle` marks the entity table. The list is flushed into records at the end of each sync point, isolated ones
  included, and wherever registration publishes now. Each record's version is stored last, with `Atomics.store`.
- **Reads:** a thread checks a record's version, one load, before using what it cached for that archetype, and keeps
  per-archetype column views and kernel columns, rebuilt only when that version moves. The whole-buffer view serves the
  header and records; columns stay views of their own, as kernels and layouts take them. On an entity-table version
  change, a worker updates the `entities` object its spawners hold in place.
- **Messages:** only new components' schemas are posted, none for a value that isn't data, since a message closes the
  pool's windows. A new archetype is found in the table, its record naming its component numbers, the first time a
  task names it.
- **Counts:** pool tasks carry their rows, so records have no `count` until phase 5, when joined threads iterate.
  Archetypes whose count changed are then appended to a dirty list where it changes, and flushed with the rest.
- **Lookups:** WASM lookups keep their per-lookup directories (`directories.ts`), a match flag and each read column's
  address per archetype, so a lookup searches nothing. JS kernels' lookups on workers read archetype records.

### Task rings

The pool's ring (`pool.ts`, `protocol.ts`) generalized to every thread. Today it carries only WASM kernel tasks, all
numbers, with claimed splits; a JS kernel's task, with its resources, input and commands, is a message, which closes
the pool's windows; rings for joined threads don't. Pool workers are nested workers of the world's thread by default;
the main thread may create them and pass their ports instead. Each ring has posted, done, epoch and signal words on
their own cache lines, plus payload words: task kind, system index, tick, `lastRun`, input offset, and **the sync
number the task needs replayed through**. Workers wait in a window with `Atomics.wait`. The world's thread, and the
main thread, wait with `Atomics.waitAsync`, or a posted message where that's unavailable. A joined thread never
blocks waiting for its own `run`: it waits asynchronously, or, in a window, on the one signal word that both task
posts and its runs' completions bump, so the world can always reach it. Consecutive tiers whose systems are all on one
thread go as one task, with no barrier between them.

### Thread ports

A port is `{ post, onMessage, onDeath, terminate }` over a browser `Worker`, a node `worker_threads` worker, a
`MessagePort`, or a worker's own scope, with `terminate` async. The node side is imported only on node, so browser
bundles never load it. For a port the main thread passed, its owner forwards the worker's error and exit as messages,
and `terminate` asks the owner. Death is a `Worker`'s `error`, a node worker's `exit`, or a `MessagePort`'s `close`
where the platform has it; nothing polls, so a quiet world does no work. Worker counts come from the port's platform:
`navigator.hardwareConcurrency` or `os.availableParallelism()`.

### Command rings

The world's thread keeps its own `CommandBuffer`s, as now. Every other thread has one ring in shared memory, with that
thread as its only writer, drained by the world's thread at the sync point. Commands are `despawn`, and `add` and
`remove` of one component or a list.

- **Values:** structs are written as bytes in the target storage's layout, through each component's layout writer.
  The world drains a segment into a `CommandBuffer` whose values for those components are bytes: `writeRange` copies
  them, and the plan's references, finalizers' `commandValue` and holder-index changes decode only what they read. An
  object value is a tag: start, `null`, or a slot. A slot names an object of the issuing thread's own logical thread,
  kept there in a staging array with its entity and component.
- **Kernels:** a pool kernel's values are scalars, tuples, structs, `null` or `undefined` (its start), and kernels read
  no object component (`compiler/subset.md`). So an object component gets the start or `null` tag, and a tuple or
  struct value for a component without a linear layout fails at the kernel's registration. `FromWorker` carries only a
  task's completion, with its ring extent, and its error.
- **Merge order:** each block carries a merge tag (tier, system index, chunk index). The world consumes blocks in its
  own schedule order, as it awaits chunks now, and checks each tag rather than sorting, so the order never depends on
  which thread ran a chunk. WASM kernels issue no commands, so claimed splits don't touch it.
- **Size:** a thread loads its ring's base, capacity and write cursor from shared words at each task's start; the world
  resets the cursor, and regrows the ring, at the sync point, when no task runs. A task that fills the ring writes the
  rest of that chunk's commands and spawns into a private buffer carried in its completion message, after its ring
  part, and stores what it needed in a high-water word, which the next sync point grows the ring to.
- **Spawns,** `spawn(components)(values)`, stay staged (`staging.ts`), not commands: each thread stages into private
  batches per component set, in the target storages' layout, as the main thread and pool workers do now, and reserves
  entities in blocks. At a task's end a worker copies each batch's rows into its ring as a block tagged with its
  chunk's merge tag, in place of the `PostedSpawns` it posts now, with the reservation ranges its block left unused.
  The sync point commits blocks in merge order, right after the world thread's own batches and before any command, as
  it commits posted batches now, and returns the unused ranges to the free list.

### Runs from joined threads

`run(system, input)` from a joined thread writes a ring entry naming the system by the thread's number for its id,
with a sequence number. Struct input with a fixed-size schema is encoded in the entry; other input is posted as a
message tagged with that sequence number, which the world waits for when it reaches the entry, so runs land in call
order. Each run is its own sync point, as on the world's thread, and makes the next beat tick. `run` resolves through
a completion word; the report is posted only when it isn't clean.

### Object columns on other threads

By row on their thread, exactly as `storage.values[row]` is today, so iteration costs nothing more. Their `added` and
`changed` ticks live beside them on that thread, by row, so writes and stamps there touch nothing shared. The world's
storage for a remote object component holds no values, and its row copies skip it. Each joined thread keeps a mirror
of the state its systems need: archetypes by the world's numbers with views from the directory, its own object columns
and ticks, keys, layouts and starts, and commands that write to its ring; the plan and structure stay on `world`.

**The move log.** For archetypes containing a remote object component, apply appends, in apply order:
`move(fromArchetype, fromRow, toArchetype, toRow)`, `swap(archetype, lastRow, row)` (with `lastRow` equal to `row` when
the removed row was last), `append(archetype, row, slot)`, `set(archetype, row, component, slot)`, and range forms for
bulk operations, 16 bytes each, under a header per sync naming its tick, which is the sync number; an entry whose
component starts in its row carries an added flag, so the thread stamps `added` as the world would, re-adds within one
sync point included. Every path that moves or fills a row appends: `commitBatches` and `commitStaged`, `writeValues`
for entries that stay, `arrive`, `leave` and its `swapRemove`, `rederive`, isolated sync points, and `finalizeAll` at
dispose. The world stores "published through sync N" after each sync point's entries.

**Replay.** A thread replays lazily, only syncs published: before a task whose payload names sync S, or an observer
evaluation, it processes each pending sync in order: its finalizers first, against values still at their pre-apply
rows, then its log. After copying entries it checks the writer hasn't lapped it. A staged slot that no entry of sync S
names was dropped, and is cleared without a finalizer. The log holds max(4096, the rows of the archetypes holding the
thread's objects) entries; past that it drops them, and a thread behind rebuilds, at a task's head or under the
structure epoch: it keeps an entity column per archetype it holds objects of (8 bytes a row, updated by replay), maps
entity to value from its old rows, refills from the shared `entities`, and applies each staged slot whose entity is
alive with its component, the last in issue order.

### Systems on other threads

A blocking tier on a joined thread is a task on its ring. Its systems write struct resources and stamp ticks in the
shared cells as the world's do, issue commands into the thread's ring, and write their reductions' folds into the
completion block, which the world combines in system order, as it combines its own.

### Finalizers on other threads

Before apply, the world's thread writes a stop list per thread: each stopped entity, its pre-apply archetype and row,
and a copy of the struct components the finalizer declares in `read`. Stop-list buffers grow, and none is reused
before its thread acknowledges it. The thread runs its finalizers when it next processes that sync, in declared order
within the thread, then stores "finalized through sync N". The guarantee: each such finalizer runs exactly once per
stop, on its thread, before that thread's next task or observer evaluation after the sync point and before the
entity's index is reused, seeing its declared struct reads and its thread's objects as of before apply. Indexes whose
entities had such finalizers are held, apart from `released`, so the leak scan neither counts nor releases them
again, and return to the free list once their threads acknowledge. A thread that dies has its held indexes returned,
and its finalizers that didn't run are reported as `"thread"` failures.

### Struct observers and mailboxes

A joined thread posts its query once at subscribe; the first value comes later, as `Observe` allows. After each run or
tick, the world's thread runs the cheap candidate check it runs today (`observers.ts`), one branch while no joined
thread observes, and writes each changed result into that thread's mailbox: a triple buffer in shared memory, three
slots and a shared index with a fresh bit, swapped with `Atomics.exchange`, so the writer never waits and the reader
takes the newest complete slot; a reader that falls behind skips to the newest value. Each slot has a header with its
offset and capacity; only the writer grows a slot, and only the one it's writing, freeing the old block, so the slot
a reader holds never moves. Results carry resource cells, listed entity components, or the entity list of `select`;
never objects. One `Atomics.notify` per thread per tick with deliveries. A whole-entity observer (`observe.entity(entity)`
without options) on a joined thread gives struct components and its own thread's objects.

### Structure epoch

One shared word, odd from `materialize` at the start of a sync point until its directory writes at the end, a window
that includes commits of staged spawns and any GPU readback. Threads that read entity locations outside a task,
observers of their own objects and rebuilds, read while it's even and check it again after, retrying on a change; a
reader that finds it odd waits on the word, which the world notifies when it turns even, rather than spinning. The
guarded words (`archetype`, `row`, `generation`) are read with `Atomics.load`, since on ARM64 a plain load may be
satisfied after the closing check. Values are never guarded by it: scheduled reads are ordered by tiers, and observers
read published results.

### Tails

Tails at the end of tick N sit just before the head of tick N+1, and ordinary scheduling applies across that boundary.
A tier in N+1 that writes what a tail reads waits for the tail's reads, which end when its body ends. A sync point
counts as a write to everything a tail reads, from its `materialize` on, since growth frees blocks the same sync point
may reuse.

- **Fallback snapshot.** Sometimes a conflicting writer in N+1 is ready before the tail has finished its reads, as when
  main is late. A tail claims its rows in chunks with `Atomics.add` on a progress word. The world's thread exchanges
  the word for a sentinel, copies the declared struct reads of the passing rows from that position on, with their
  entities, into a tail buffer, and waits until the tail is done through the chunks it claimed, at most one chunk,
  before the writer runs; the tail reads the rest from the copy. The values are the same either way, so this stays
  deterministic. A prompt main never copies.
- **The tail's own objects** are read where they are. The next sync point's moves wait in the log until the tail
  finishes.
- **Report.** A tick ends in two steps: its tiers and sync point, which release the world's queue so N+1 can start, and
  its report, written to the `report` resource once after its tails, so their failures are in it.

### Transfers

A `transfer: true` value goes from a joined thread to its component's thread through `run(system, input)`: the value
is in the input, posted with its transfer list on a channel the world sets up between joined threads, and the run's
ring entry is held until that thread acknowledges receipt. Runs from that thread land in call order, so later ones
wait behind it; the world's thread never waits on delivery. A value whose command drops is released on its thread.

### Without cross-origin isolation

Memory isn't shared, so the world runs inline, and `share` and `World.join` will throw.

## Cost

| Common operation | Cost |
|---|---|
| Iterating rows, struct or object, on any thread | as today: no added load per row |
| A quiet loop | nothing: no tick, no delivery, workers parked |
| A run | its own sync point, in call order; the next beat ticks |
| A sync point with growth, other threads joined | one directory record per changed archetype; a message only for new archetypes or components |
| A task on any thread | one load per archetype it touches, of its record's version |
| A tier on a thread other than `world` | one ring post and notify, one done-counter wait; consecutive tiers on that thread are one |
| A blocking tier on main | main's event-loop latency, which the report warns about |
| A terminal tail on main, prompt | one post; nothing copied; the next tick waits only if main is late at a conflict |
| A terminal tail on main, late at a conflict | a copy of the declared struct reads of its unclaimed passing rows, and a wait of at most one chunk |
| Commands and staged spawns from a worker kernel or joined thread | ring writes; the private spill and its message only past the ring's size |
| `run` from a joined thread | one ring entry and notify; resolves through a word |
| Struct observers on a joined thread, per tick | candidate check on the world's thread, a mailbox write of changed results, one notify |
| Structural change touching archetypes with remote objects | one log entry per row moved, replayed once on that thread |
| Despawning entities with remote finalizers | stop-list copy of declared reads; the world's thread doesn't wait |
| A transferred asset | one message, loader to its thread; one run |

## Memory

- **Directory:** a header; a table of record offsets; a record per archetype, 16 bytes plus 32 bytes per storage.
- **Rings:** per thread, a task ring as the pool's, and a command ring sized to the largest tick's commands and staged
  spawn rows, grown at sync points to the high-water word.
- **Move log:** 16 bytes per entry, up to max(4096, the thread's rows); 8 bytes per row of the archetypes it holds
  objects of, for its entity column.
- **Mailboxes:** three slots per observing thread, each sized to the largest result delivered.
- **Tail buffers:** only once a fallback snapshot was taken: passing rows times their declared struct reads, kept for the next.
- **Stop lists:** per stop, the entity, its row and its declared struct reads, kept until acknowledged.

## Phases

Each phase leaves the package shippable with every test passing, and starts interface first: type changes with red
then green type tests, then runtime with red then green runtime tests. Each phase ends with `pnpm perf --record` and
`pnpm perf:browser --record`; listed benchmarks must not regress beyond noise.

### Built: threads in declarations, the loop, and the pool

- `Threads`, `thread`, `transfer` and the DOM rule in types, with registration's checks; a system's and finalizer's
  thread derived, and two threads rejected, when it's created. With every thread filled by `world`, nothing changes at
  runtime.
- Ids: the plugin gives top-level keys and `System.create`, `System.render`, `Rule.create`, `Finalizer.create` and
  `Finalizer.changes` bindings ids, in worker bundles too; the registry takes symbols or values of one id as one key or
  item. Nothing rejects a key or item without one yet.
- The loop, inline: `add`, `cadence` with `maxSteps`, `always`, `wake`, `clock`, `report`, beats on animation frames or
  timers, and the `workers` resource sizing the pool at sync points. `World.Report` has no `"thread"` failure kind.
- The pool: WASM kernel tasks through per-worker rings with claimed splits, JS kernel tasks by message; kernel spawns
  staged into batches per component set on the main thread and workers, posted back per chunk and committed in merge
  order, with entities reserved in blocks whose unused positions the sync point returns; `terminate` waits for workers
  to leave their windows before releasing the pool's control state to the arena.
- `share` and `World.join` aren't public yet; they come with joining.

### Built: phase 1, shared layout directory

The directory as above, without counts or the resource archetype (`layout-directory.ts`): workers read archetype and
entity-table layout from it, and `publish.ts` posts only new components. WASM lookups keep their directories.
`WorldOptions` gains the loop host as `loop`, and `backToBack()` is the `MessageChannel` driver.

- Interface: none. Contract: none.
- Tests: the existing worker browser tests; a test that grows 100 archetypes across sync points and checks workers'
  kernels see every row, with no layout message after the one creating them; one that grows the entity table between
  runs and checks workers' lookups and spawns use the new table, with no message; one that grows memory between runs
  and checks workers rebuild their views; a worker whose memory is shorter than the byte-length word fails its tasks.
- Must not regress: `sync point one spawn`, `run idle`, `run 50 idle`, `create`, `churn`, `spawn bulk kernel`, and in
  chromium `move workers`, `follow workers`, `chain workers`, `sparse changed workers`, `spawn bulk kernel workers`,
  `up depth 10 workers`.
- New, in chromium: `sync point grow 100 archetypes main` and `workers`: 100 archetypes, each filled untimed to its
  capacity, then one spawn into each timed as one sync point, followed by a kernel over them in the workers variant so
  workers take up the layout; repeated for a fixed number of doublings, keeping the fastest.
- New, in node and chromium: `loop tick idle`: ticks with nothing changed, driven back to back by the `MessageChannel`
  loop host with `always` set, counted through `observe.resource(clock)`; N = 10,000 ticks.

### Phase 2: thread ports and node workers

`pool.ts` and `worker.ts` take the port abstraction, so real-thread tests run in node, and pool workers can be nested
workers of a world on a worker, or ports the main thread passes. A port's terminate is async, as `pool.terminate` is,
which still releases control state only once every windowed worker has left. Worker counts come from the port's
platform, not `typeof Worker`.

- Interface: none. Contract: none.
- Harness: a Vitest global setup runs one `vite build` with the plugin, as `pnpm perf` bundles (`ssr`, `noExternal`),
  of fixture modules and of `worker.ts` as a second entry, emitted as `worker.js` beside the chunk that references it,
  since a `worker_threads` worker doesn't go through Vitest 5's module runner. A built fixture has its own copy of the
  registry, so the cases' keys and systems live in the fixtures, which export scenarios; node tests import the built
  fixtures and assert; browser tests run the same fixtures.
- Tests: the worker browser tests' cases, moved into fixtures, in node and chromium; the pool tests (a worker that
  can't load, control state released on terminate) in both; a worker that dies mid-task, killed from outside, in
  both.
- Must not regress: every `workers` benchmark.
- New: in node, `move workers`, `follow workers`, `spawn bulk kernel workers` and `sync point grow 100 archetypes
  workers`; `wake` (a notify from the world's thread to a waiting worker and back, N = 10,000), node and chromium.

### Phase 3: command rings for the pool

Worker kernels write commands into their thread's ring, with merge tags, values as bytes, start and `null` tags, and
their staged spawn batches as tagged blocks with their unused reservation ranges; the spill past the ring's size and
the high-water word; `CommandBuffer`'s byte values, which `writeRange` copies and the plan's references, finalizers and
holder-index changes decode. `FromWorker` carries a task's completion, ring extent and error, and a spill. The world's
own commands, the sync point's commit of staged rows and its plan's order are unchanged.

- Interface: none. Contract: a kernel giving a tuple or struct to a component without a linear layout fails at
  registration.
- Tests: the existing merge tests, commands at 0 and 3 workers and staged spawns at 0, 1, 2 and 7, with commands
  extended to 0, 1, 2 and 7, in node and chromium; a task that overflows its ring spills in order and the ring grows at
  the sync point; a failed task's commands and spawns before its failure still apply; unused reservation ranges return
  to the free list once; object components get their start or `null`; a kernel giving a tuple to an object component
  fails at registration.
- Must not regress: `emit`, `churn`, `sync point one spawn`, `spawn bulk kernel`, `despawn bulk kernel`, `add tag
  kernel`, `remove tag kernel`, `spawn bulk kernel main`, `spawn bulk kernel workers`.
- New: `emit main` and `emit workers` (`emit`'s kernel, an add for a tenth of 1M rows), node and chromium.

### Phase 4: joining

`share`, `World.join`, the handshake through the thread's entity, local numbering of keys and items, remote `run`
through command rings, sequence numbers and completion words, struct observers through mailboxes, the resource
archetype in the directory. Every logical thread is still filled by `world`; a claim is recorded and checked against
claims already made.

- Interface: `world.share(port)`, returning the joined thread's Entity with read-only status components written only
  by the world, the port kept internal; `World.join` and `World.Port`.
- Contract: the first notification on a joined thread always comes later, and a slow one gets the newest value;
  `observe.entity(entity)` on a joined thread gives struct components plus that thread's objects; a threaded world
  rejects keys and systems without ids where they cross threads, and a run of an id the world never imported;
  `share` and `join` are public.
- Tests: node and browser, the world on a worker with main joined, and the reverse; observers of resources, entities,
  select and count; runs with struct and object input from a joined thread land in call order; a joined thread that
  dies has its status `"gone"`; a joined thread's `run` of a system without an id rejects, as does one the world never
  imported, and a thread claimed twice; keys and items of one id from separately bundled threads are one; no
  cross-origin isolation throws at `share` and `join`.
- Must not regress: `run idle`, `run 50 idle`, `select`, `sync point one spawn`, `loop tick idle`.
- New: `remote run` (an empty transaction from a joined thread, N = 1,000); `mailbox resource` (one observed resource
  changed per tick, N = 1,000 ticks); `mailbox select 10K` (a `select` over 10,000 entities whose order changes every
  tick).

### Phase 5a: remote object columns and the move log

Claimed threads fill their object components: object columns by row on their thread, staged slots with their entity
and component, the move log over every apply path with its added flags, published-through word, replay with its lap
check, and rebuild; observers of objects on their thread; the structure epoch; directory counts. A claim whose systems
or finalizers exist is rejected until 5b and 5c.

- Interface: none. Contract: commands may give another thread's object components only their start or `null`.
- Tests: a property test of random spawns, despawns, adds and removes, single and list forms, issued by world-thread
  systems, on archetypes holding objects on another thread, whose values that thread stages through its staging array,
  comparing its values and ticks with an inline world's after every tick by a stable id component, with no pool
  workers, with the log forced to drop; an observer of its own objects reads through the epoch while the world applies;
  a command giving a remote object a value other than start or `null` fails.
- Must not regress: every benchmark, inline.
- New: `log replay` (10,000 swap-removes and moves per sync point, time per move); `log rebuild 100K` (a forced
  rebuild over 100,000 rows).

### Phase 5b: blocking tiers

Joined threads' mirror state and runners, blocking tiers through task rings with fusion, commands and spawns from
those systems into their rings, reductions in completion blocks, `"thread"` failures, and `warnings` for blocking
tiers. Claims check that the joined thread imported their systems, by id.

- Interface: the `"thread"` failure kind in `World.Report`'s `Failure` and the `report` resource's schema, with the
  doc for systems skipped because their thread is gone; `warnings` in `World.Report`; both type-tested.
- Contract: a blocking tier is listed in its tick's `warnings`.
- Tests: systems on a joined worker in node and chromium give an inline world's results, commands, spawns and
  reductions included; a joined thread that dies leaves its systems in `skipped` with a `"thread"` failure; joining
  with a claimed thread's system it hasn't imported, or one without an id, rejects; a main thread that never yields
  doesn't stall ticks that don't touch it.
- Must not regress: every benchmark, inline.
- New: `handoff` (10 tiers alternating `world` and a joined worker, empty systems, N = 1,000 ticks); `fused tiers` (10
  consecutive tiers on a joined worker).

### Phase 5c: remote finalizers

Stop lists, finalizers run at replay, held indexes returned on acknowledgement or on the thread's death.

- Interface: finalizers that read remote objects lose `commands` and resource writes, type-tested; remote finalizers
  with `lookup`, and remote `Finalizer.changes`, rejected at creation.
- Contract: such finalizers run after the sync point, under the guarantee above.
- Tests: finalizers run once per stop, before index reuse; held indexes survive the leak scan and return once; a
  thread that dies returns them and reports its finalizers.
- Must not regress: every benchmark, inline.
- New: `despawn objects 10K`.

### Phase 6: tails

Terminal systems proven by the plugin and scheduled across the tick boundary, waits only at conflicts, chunk claims,
fallback snapshots when a tail is late, ticks resolved in two steps.

- Interface: none.
- Contract: a tick's report includes its tails' failures, written once after them.
- Tests: a terminal main system over 1,000 rows while the world ticks continuously, checking that every tail sees one
  tick's values, whether read in place, from a snapshot, or both across a switch at a chunk; a prompt main never
  snapshots; a sync point that grows what a tail reads waits or snapshots before it materializes; a tail that throws
  is in its tick's report; a body that reaches `commands` isn't terminal.
- Must not regress: `run idle`, `move main`, `main thread`, `loop tick idle`.
- New: `tail prompt` (the next tick's start latency with a 1,000-row main tail that finishes in time, N = 1,000
  ticks); `tail late snapshot 10K` (a late tail of 10,000 passing rows of a vec3 and a mat4, the copy's cost).

### Phase 7: transfers

Transfer values through runs, their channels and acknowledgements. A sample runs the world on a worker with an
OffscreenCanvas and the DOM on main, and a loader worker transferring decoded textures.

- Interface: type tests for `transfer` values in a run's input from another thread.
- Contract: a run carrying a transfer lands once its value has arrived, in call order with that thread's other runs.
- Tests: browser only; a transfer whose acknowledgement arrives late holds its run and that thread's later runs; a
  value whose command drops is released.
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
- **Liveness polling of joined threads:** a quiet world does no work, so death is what the platform reports.
