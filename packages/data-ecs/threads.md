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
  registry already takes the symbols of one id as one key; a key without one can't cross, so a joined thread's
  observer naming one throws at subscribe. Ids name packages, not directories, so threads bundled apart agree on them,
  and the plugin adds itself to `worker.plugins`, so worker bundles' keys get them too.
- **Systems, rules and finalizers are their values,** and names are optional labels, so a value is different on each
  thread too. Threads agree on them through the ids the plugin gives top-level `System.create`, `System.render`,
  `Rule.create`, `Finalizer.create` and `Finalizer.changes` bindings, composites included, by which the registry
  already takes values of one id as one item. A threaded world rejects an item without one where it crosses threads:
  a system or finalizer placed on a joined thread, and a system a joined thread runs, at join or at that run; a
  composite crosses only if every member has an id. Rules run only at `world`'s sync points, so they never cross. A
  kernel crosses as its chunk's url and the world's index for it, as pool workers load it now; kernel chunks keep
  their exports' signatures, so every thread's import finds them.
- **Threads number what crosses locally.** A joined thread gives each key and item it sends its own number, and posts
  the id once by message the first time; the world maps (thread, number) to its own. The world holds runs whose slots
  use a number it can't map yet, in order, until that message arrives. A run of an id the world never imported
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

// On the thread that holds the world:
const world = World.create(resources?);
world.share(port);   // lets another thread join through the port: a MessagePort, a Worker, or a worker's own scope

// On another thread, after importing the modules whose systems, observers and finalizers run there.
const joined = join(port, { threads: ["main"] });
```

`join`, the implementation's, returns the same `World` type; the interface names neither it nor its port or options,
which it infers from `share`. Its `run` and `observe` work as on the world's thread, `add` and `share` throw there, and
its `dispose` disconnects this thread; disposing on the world's thread disposes the world, and joined threads' runs
reject from then on. `share` returns nothing: a joined thread's progress (`"joining"`, `"joined"` once the threads it
claims are its own, `"gone"` once they're released) and its claims are the implementation's own storage, which
`createWorld`'s `threads` observes for tests and benchmarks. A port is a `MessagePort`, a `Worker` or a worker's scope,
of the browser or node, and a joined thread's `dispose` closes only a `MessagePort`, never a worker or its scope.

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
  struct resource, reduces into nothing, and looks nothing up, since a lookup reads the entity table the next sync
  point rewrites. Commands are in every non-GPU system's context, so "issues no commands" is what the plugin proves from
  the body (`compiler/terminal.ts`): its context absent, destructured by plain names other than `commands` without a
  rest, or a name used only as `name.property` for other properties, and no `arguments` or `eval`; the plugin marks such
  a body by wrapping it, as it gives ids. A system the plugin can't prove is not terminal. A tail's context has no
  `commands`. DOM-writing systems and render systems are terminal. A remote terminal system that no system of a later
  tier conflicts with runs as a tail (see Tails). Any other remote system is a blocking tier, and the tick's report
  lists it under `warnings`.
- **Observers:** one that names objects of a thread other than its own throws at subscribe. A struct-only observer is
  evaluated on `world`. One that names its own thread's objects is evaluated on its thread.
- **Finalizers** run on the thread of the objects they read, after the sync point where a joined thread fills it. So
  one on another thread than the world's, which a joined thread may fill, has no `commands` in its context, writes no
  resources and declares no `lookup`, and `Finalizer.changes` watches and reads only the world's thread's values, in
  types and at creation; `before`/`after` across threads is an error at creation.
- **Values for another thread's objects:** a command issued on one thread may give an object component of another
  thread only its start or `null`, as tags the owning thread resolves. Any other value fails the command: a spawn's when
  it's issued, an add's when its system's commands are queued on the world's thread, or when it's issued on a joined
  one, where it drops and its system fails, so the issuing paths check nothing while no joined thread fills objects.
  `transfer` components are the exception (see Transfers).
- **`up` runs only on `world`:** a system declaring it can't be placed on a joined thread, which refuses the claim, or
  fails the system's registration once the thread is joined.

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
  are in `skipped`, each with a `"thread"` failure, and later tiers still run. A tier that waited for a joined thread
  is in the report's `warnings`.
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
  holds `capacity`, the `entities` offset, a version, its flags and its count, and per storage its component number, its
  flags (`ticked`, linear, remote with the joined thread's number), its column, tick and chunk-tick offsets and its
  chunk count; a remote storage's column is its tags. Offsets are `Uint32`, since memory reaches 4 GiB. The resource
  archetype has a record too, flagged, and the header holds the resource entity's index.
- **Entity-table record:** the `cursor` offset, which never moves, the free list's offset and capacity, the
  `archetype`, `row` and `generation` offsets and capacity, and a version. The table's length is `cursor[2]`. Its
  arrays move whenever they grow, even without memory growing, since a grown array's old block is reused.
- **Writes:** the world's thread keeps its JS fields as the source of truth on its hot paths. Growth and `startTicks`
  bump an archetype's version and append it to a list of bumped archetypes; table growth in `materialize` and
  `recycle` marks the entity table. The list is flushed into records at the end of each sync point, isolated ones
  included, and wherever registration publishes now, those between sync points under the structure epoch while a joined
  thread holds claims. Each record's version is stored last, with `Atomics.store`.
- **Reads:** a thread checks a record's version, one load, before using what it cached for that archetype, and keeps
  per-archetype column views and kernel columns, rebuilt only when that version moves. The whole-buffer view serves the
  header and records; columns stay views of their own, as kernels and layouts take them. On an entity-table version
  change, a worker updates the `entities` object its spawners hold in place.
- **Messages:** only new components' schemas are posted, none for a value that isn't data, since a message closes the
  pool's windows. A new archetype is found in the table, its record naming its component numbers, the first time a
  task names it.
- **Counts:** pool tasks carry their rows; joined threads read counts. While a joined thread holds claims, archetypes
  whose count changed are appended to a dirty list, by pair and by batch where the sync point changes them, and their
  counts flushed with the rest; a new record carries its count.
- **Lookups:** WASM lookups keep their per-lookup directories (`directories.ts`), a match flag and each read column's
  address per archetype, so a lookup searches nothing. JS kernels' lookups on workers read archetype records.

### Task rings

The pool's ring (`pool.ts`, `protocol.ts`) carries WASM kernel tasks, all numbers, with claimed splits; a JS kernel's
task, with its resources and input, is a message, which closes the pool's windows, and its commands come back through
its worker's command ring. Pool workers are nested workers of the world's thread by default; the main thread may create
them and pass their ports instead. Each ring has posted, done, epoch and signal words on their own cache lines, plus
payload words. Workers wait in a window with `Atomics.wait`. The world's thread, and the main thread, wait with
`Atomics.waitAsync`, or a posted message where that's unavailable.

A joined thread's tasks go through its task block (`thread-tasks.ts`), since one is in flight at a time: the world posts
one and waits for it before the next tier or the sync point. Its words, each group on a line of its own: posted and
done; the command ring's base and capacity and the payload's and completion's offsets and capacities, which the world
sets while no task runs; and the ring's cursor and needed bytes, which the thread stores. The payload holds the task's
sequence, **the sync it's replayed through**, whether its input comes by message, and per system its index on the
thread, the tick it takes, its `lastRun`, its tier within the task and where its folds go. A joined thread never blocks
waiting: it waits asynchronously on the one signal word that both task posts and its runs' completions bump, so the
world can always reach it. The world spins about 20 µs for a task before it waits, and a thread that finished one
spins as long for the next, each about one wake-up's latency, since a tick's tasks follow each other closely.
Consecutive tiers whose systems are all on one joined thread go as one task, with no barrier between them.

**A joined thread returns to its event loop at least once a tick,** so its timers, rendering and promises' callbacks
run however fast the world ticks: the world bumps a run word in the log header once a run's or tick's tiers are done,
before its sync point and tails, and a thread holding claims takes a turn of its event loop rather than go on
synchronously once that word moved since its last turn, so after the tick's last task there, while the world applies
the sync point; any thread takes one after at most 2 ms of work, a task's own length aside. A wait that resolves
asynchronously is a turn already. A turn costs about a microsecond: a message to itself in a browser, and in node,
whose messages can arrive without its timers running, a wait on a word of its own that times out at once (a timed
wait in a browser takes a millisecond). The trade: about 2 µs a tick where ticks follow each other back to back
(`handoff` +15%, `tail prompt` +13% in node, +10% and +15% in chromium; `fused tiers` and `remote run` within noise);
none for ticks a frame apart, between which the thread waits anyway.

### Thread ports

A port is `{ post, onMessage, onDeath, terminate }` (`port.ts`) over a browser `Worker`, a node `worker_threads`
worker, or a `MessagePort` another thread lent; a worker talks over its own scope, `self` or node's `parentPort`, as a
channel, `{ post, onMessage }`. `terminate` is async. Node's modules are loaded through `process.getBuiltinModule`,
only on node, so browser bundles never load them, and the node worker's url isn't written as `new Worker(new URL(...))`,
so a browser build bundles one worker (`worker-platform.ts`). Death is a `Worker`'s `error` or `messageerror`, a node
worker's `error`, `messageerror` or `exit`, or, for a lent worker, what its owner reports or either `MessagePort`'s
`close` where the platform has it, whichever comes first; nothing polls, so a quiet world does no work. A browser
`Worker` ended from outside its port reports nothing, so a lent worker's owner reports the end of one it ends.

- **Platforms:** a world's pool comes from a platform, `{ count, start }`: `count` is what the `workers` resource's
  `null` resolves to, its hardware threads, `navigator.hardwareConcurrency` or `os.availableParallelism()`, minus the
  world's thread, and `start` starts one worker, or returns null when it has no more, so a pool takes as many as it
  gets. The platform's own is browser workers where `Worker` exists, nested ones on a worker, else `worker_threads`, else
  none. `WorldOptions`' `pool` gives another, or null for none: `lentWorkers(lent)` for workers another thread lent.
- **Lending:** the owning thread starts each worker, posts it the `MessagePort` it talks on as its first message, and
  keeps a second channel to the thread it's lent to, on which it reports the worker's death and ends it when asked; a
  lent worker is started once, so a pool resized past what was lent gets fewer workers. `terminate` asks the owner and
  closes both ports once it answers, or once the owner's port closes.
- **Tests:** a Vitest global setup (`vitest.fixtures.ts`) builds every `*.fixture.ts` with the plugin, as `pnpm perf`
  bundles benchmarks, and `worker.ts` as a second entry, `worker.js`, in one directory, since a `worker_threads` worker
  doesn't go through Vitest's module runner. A fixture holds its cases' keys and systems, since a built fixture has its
  own registry, and exports scenarios that return data; `*.cases.ts` asserts on them, over the built fixture in node
  (`threads.test.ts`) and the source in chromium (`threads.browser.test.ts`). Other node tests run under the module
  runner, where workers can't load the sources, so those with kernels pin `workers` to 0.

### Command rings

The world's thread keeps its own `CommandBuffer`s, as now. Every other thread has one ring in shared memory, with that
thread as its only writer, drained by the world's thread at the sync point. Commands are `despawn`, and `add` and
`remove` of one component or a list.

- **Segments** (`command-ring.ts`): each task's is one block, on 8 bytes: a header with its merge tag and counts; its
  commands as the columns of a `CommandBuffer` (entities, values' bytes, first components, component ids, offsets into
  the values' bytes, kinds); its tagged values; its staged spawn batches, as blocks; and the reservation ranges its
  block left unused. The worker builds the columns in arrays of its own, reused by every task, and copies them in at
  the task's end, so the world drains a segment by taking views of its columns, decoding nothing but its tags.
- **Values:** structs are written as bytes in the target storage's layout, through each component's layout writer,
  with numbers and f32 lane tuples written straight in. The world's `CommandBuffer` for a segment keeps those values
  as bytes in the ring, at the offsets its column gives: `writeRange` copies them, by 32-bit word, and the plan's
  references, finalizers' `commandValue` and holder-index changes decode only what they read. Any other value is a tag:
  start, `null`, a number or a boolean, which the world resolves, start to the component's start; a value left out is
  the start tag, struct or not; from phase 5, a slot, which names an object of the issuing thread's own logical thread,
  kept there in a staging array with its entity and component.
- **Kernels:** a pool kernel's values are scalars, tuples, structs, `null` or `undefined` (its start), and kernels read
  no object component (`compiler/subset.md`). So an object component gets a tag, and the compiler lists the components
  a command or spawn gives a tuple or struct, which fails the kernel's registration for a component without a linear
  layout; any other value one can't take fails the task. `FromWorker` carries only a task's completion, with its ring
  extent and its spill, and its error.
- **Merge order:** each segment carries a merge tag: its system's run, by the tick it took, and its chunk, by archetype
  and first row. The world consumes segments in its own schedule order, as it awaits chunks now, and checks each tag
  against the task it posted rather than sorting, so the order never depends on which thread ran a chunk. WASM kernels
  issue no commands, so claimed splits don't touch it.
- **Size:** a pool worker's ring words are in its control line: base, capacity, write cursor and the bytes its tasks
  needed. It loads them at each task's end, when it writes its segment; the world resets the cursor, and regrows the
  ring, after the sync point, when no task runs. A segment that doesn't fit what's left of the ring goes whole into a
  private buffer carried in its completion message, and the worker adds what it needed to the needed word, which the
  next sync point grows the ring to, at least doubling it. A ring starts at 64 KiB; a dead worker's is left to it,
  since it may still write.
- **Spawns,** `spawn(components)(values)`, stay staged (`staging.ts`), not commands: each thread stages into private
  batches per component set, in the target storages' layout, as the main thread and pool workers do now, and reserves
  entities in blocks. At a task's end a worker copies each batch's rows into its segment as a block, after its
  commands, then the reservation ranges its block left unused. The sync point commits blocks in merge order, right
  after the world thread's own batches and before any command, as batches over the ring, and returns the unused ranges
  to the free list.

### Joining

- **The handshake** (`sharing.ts`, `join.ts`, `joining.ts`): a joined thread's first message names the threads it
  claims, whether it can wait with `Atomics.waitAsync`, and a Web Lock it holds while it lives, where the platform has
  Web Locks, and with claims the ids of the systems and finalizers it imported; it posts nothing else until the lock is
  held. The world refuses a thread claiming `world`, one thread twice, one another joined thread claims, or one a
  registered system or a finalizer of the program runs on that the thread can't run: one without an id, naming a key
  without one, declaring `up`, or one it didn't import, checked again between runs as its claims are made; it's refused
  with its status `"gone"` and its runs rejecting. Else the world places the thread's control words and slots in the
  memory, and writes `"joined"` and the claims. With claims, between runs, the claimed threads' object components and
  object resources become the thread's (see Object columns on other threads), each announced by message with its id; it
  places the thread's task block; it posts the memory, the offsets of its control words, its move log and its task
  block, and its number; then the systems and finalizers on the claimed threads are placed there, each posted to the
  thread with its index there, its id and the world's numbers for the keys it names. Claims are released when the
  thread is gone, between runs, its objects coming back as each row's tag names them, `null` or the start, since a value
  the thread staged or wrote was its own, and its systems and finalizers placed on the world's thread again, each system
  keeping its `lastRun`.
- **A thread's end** is a `leave` from its `dispose`, its `MessagePort`'s `close`, a node worker's `exit`, or the world's
  request for its Web Lock being granted, which happens however the thread ends, so a browser worker ended from outside
  its port is heard of too, with nothing polled. Its status becomes `"gone"` and its observers stop; a thread that left
  has its control words freed, one that died keeps them, since it may still be writing.
- **Control words,** each on a line of its own: the signal the thread waits on, which the world bumps when runs complete,
  observers have values or a task is posted, beside an unread word the thread clears before it reads what's new, so the
  world notifies only a thread that has read every earlier wake; the last run the thread posted; and the last one the
  world completed. A thread whose unread word is set again once it read reads again rather than wait, since that wake's
  notify may have found no waiter, and the next wake won't notify while the word is set. A party that can't wait
  without blocking is woken by a posted message instead.

### Runs from joined threads

`run(system, input)` from a joined thread writes a slot naming the system by the thread's number for its id, with a
sequence number: 64 slots of 256 bytes, slot `(sequence - 1) % 64`, the thread writing one only once the world completed
the run 64 before it, and holding later runs, in order, until then. Struct input of a leaf system's schema, at most 240
bytes with every number an f64 so it crosses exactly, is written in the slot; other input is posted as a message tagged
with that sequence number, which the world waits for when it reaches the slot, as it waits for an id's message, so runs
land in call order. An input that can't be posted marks its slot, which the world completes without running. Each run
is its own sync point, as on the world's thread, and makes the next beat tick. The world writes the run's status in its
slot, clean, reported or rejected, and advances the completed word through the runs finished in order; `run` resolves
through it, and the report or rejection is posted only when the run isn't clean, the thread settling runs in order once
it has both.

### Object columns on other threads

By row on their thread, exactly as `storage.values[row]` is today, so iteration costs nothing more. The world's storage
for a remote object component or object resource holds no values: it holds each row's tag (`move-log.ts`), the
component's start, `null`, a value the thread's systems wrote, or a staged slot's id, in its column in shared memory,
which row copies copy, and it keeps ticks, the objects' only ones, stamped where the sync point stamps any and by the
thread's systems as they write, so the world's observers see changes and a rebuild reads them. A write there marks the
row's tag as the thread's own value. Each joined thread keeps a mirror of its object columns (`mirror.ts`), with
keys and starts; its systems' runners (`thread-systems.ts`) view the world's archetypes from the directory, with the
mirror's columns for its own objects, and their commands write to its ring; the plan and structure stay on `world`.

**The move log.** For archetypes containing a remote object component, apply appends to the log of each joined thread
whose objects they hold, in apply order, 16-byte entries in a ring in shared memory: `move(fromArchetype, fromRow,
toArchetype, toRow)` between archetypes both holding its objects, `append(archetype, row, entity)`, `range(archetype,
row, count)` followed by its entities, two to an entry, `swap(archetype, lastRow, row)` (with `lastRow` equal to `row`
when the removed row was last), and `set(archetype, row, component, tag)`, each sync's first under a sync entry naming
its tick, which is the sync number. A row a move or an append fills starts each of the thread's objects it gains at
its start; a set gives it the value its tag names, its ticks the world's, stamped `changed`, and `added` where the
component starts in its row, re-adds within one sync point included, as the entry's added flag says. Every path that
moves or fills a row appends: `commitBatches` and `commitStaged`, `writeValues` for entries that stay, `arrive`,
`leave` and its `swapRemove`, `rederive`, and isolated sync points; `finalizeAll` at dispose moves none. The world
publishes "through position P, sync N" in the log's header after each sync point's entries, before the structure epoch
turns even, and "observers delivered through sync N" after each delivery.

**Replay.** A thread replays lazily, only syncs published: before a task whose payload names sync S, or an observer
evaluation, it processes each pending sync in order: its finalizers first, against values still at their pre-apply
rows, then its log. It copies the entries out, then checks the writer hasn't lapped it: the writer stores a limit 64
entries ahead of where it writes before writing past it, and the copy holds if the limit is within the ring's size of
where it started. A staged slot that no entry of a sync it was for names was dropped, and is cleared without a
finalizer. An entry naming an archetype holding a component whose key the world hasn't named yet holds replay before
its sync until the message arrives. The ring holds max(4096, the rows of the archetypes holding the thread's objects)
entries, rounded up to a power of two and replaced at a sync point's start when the rows outgrow it; past that it
drops them, and a thread behind, or whose ring was replaced, rebuilds, at a task's head or under the structure epoch:
rows from each archetype's record, its `entities` and count, and values by each row's tag, a slot's from the staging
array while it's there, else, and for a value its systems wrote, the thread's own, kept from its old rows by entity.
Tags make it exact: a start or `null` given after a slot or a write wins, as it did. A thread keeps an entity column
per archetype it holds objects of (8 bytes a row, updated by replay).

### Systems on other threads

A system whose thread a joined thread claims is placed there (`remote-systems.ts`): the world's runner for it stands in
the schedule, and the thread runs it as written (`thread-systems.ts`). A blocking tier on a joined thread is a task in
its task block, posted before the tier's own systems start on the world's thread, which waits for it in system order;
consecutive tiers all on that thread are one task, which stops after a tier with a failure, as the world stops.

- **Ticks:** the world gives each of a task's systems the next tick and its `lastRun`, and takes the tick as its
  `lastRun` once the thread says it ran: the thread checks conditions, which may read its object resources, so one
  skipped leaves its tick unused.
- **Rows:** the thread views each archetype from its record, struct columns and ticks in shared memory and its own
  objects in the mirror's columns, made again when the record's version or the mirror's columns move; rows are the
  world's accessor rows over those views (`rows.ts`), and change filters read the shared ticks. Resources are the
  resource archetype's row; lookups locate entities in the shared entity table. A GPU kernel's whole-column stamp
  reaches the thread as row ticks, which the world lifts to it before the task.
- **Commands and spawns** write into the thread's command ring, a segment per system, as a pool worker's do, with the
  merge tag of its tick and position. A value given the thread's own object is staged in its mirror under a slot whose
  tag the segment carries; a key the world didn't give the thread a number for is named by the thread's own number,
  its id posted first, which the world maps as it drains the segment. Spawns stage into batches per component set and
  reserve entities in blocks from the shared cursor. The world drains each segment in its system's place.
- **Completion:** per system, whether it took its tick, ran its rows and failed, its segment's extent, and its folds,
  which the world combines in system order, as it combines its own; then the done word. A message follows only with a
  failure's error, a segment that spilled past the ring, or the thread's numbers for keys named for the first time. Input
  comes by message, before the task.
- **A thread that's gone** settles its task in flight: its systems are skipped, each with a `"thread"` failure, and
  later tiers still run.

### Finalizers on other threads

A finalizer whose thread a joined thread claims is placed there, as systems are, each posted to the thread with its
index there, its id and the world's numbers for its keys (`finalizers.ts`, `activate.ts`); one created after the claim
is placed when it activates, and one the thread can't name, without an id or naming a key without one, doesn't activate
and is reported once in a sync point's failures. Once the thread is gone, they run on the world's thread again.

- **Stop lists** (`stop-lists.ts`): before apply, the world's thread writes one block per sync point with stops for that
  thread: per finalizer, in the world's finalizer order, a group of its stops as columns: each entity, its pre-apply
  archetype and row, the tag of each object it reads, and a copy of each linear struct it reads, in that component's
  layout. The world copies a column at a time, finding each column's storage once per run of an archetype. Blocks are
  linked in sync order, the first from the log header's stops word, each block's next offset stored once that block is
  whole, so a thread reads only whole blocks of published syncs. A block is freed once the thread acknowledged a later
  one, since the thread reads the next offset from the newest block it ran. The world wakes the thread after each sync
  point that published stops for it, so a thread with no task or observer still finalizes.
- **Running them** (`thread-finalizers.ts`): the thread runs a sync's stop list as it replays that sync, at its sync
  entry, before the sync's entries apply, or at replay's end for a sync with no entries for it; its finalizers read the
  linear structs from the block, constants as they are, and its objects by each stop's tag: the start or `null` as
  tagged, any other at the stop's row in its mirror. After its log lapped, it runs them before it rebuilds, reading a
  value it wrote or a settled slot's by entity in its old rows, and a live slot's from its staging array. Resources are
  read where they are. Then it stores "finalized through sync N" in the log header. A stop list naming a finalizer
  whose setup hasn't arrived holds replay before its sync, as a component without a key does; one this thread never
  imported fails each of its groups. What its finalizers throw is posted, and a later run's report lists it as a
  `"finalizer"` failure.
- **The guarantee:** each such finalizer runs exactly once per stop, on its thread, before that thread's next task or
  observer evaluation after the sync point and before the entity's index is reused, seeing its declared struct reads
  and its thread's objects as of before apply.
- **Held indexes:** the index of an entity despawned with such stops is held, counted by index for each thread that
  hasn't acknowledged it, apart from `released`, so the leak scan never sees it and the free list never has it; the
  sync point after a thread acknowledges releases it once no thread holds it. A thread that's gone has its held indexes
  returned, and each finalizer with stops it never acknowledged is a `"thread"` failure in the next sync point's
  report. A thread finalizes what was published before it leaves.
- **Dispose:** once the world is disposed, a joined thread runs the stop lists published, then its finalizers for every
  row they match, as the world's thread runs its own.
- **Restriction:** a finalizer on a thread other than `world` issues no commands, writes no resources and looks
  nothing up, wherever it runs, so the world's thread never waits for one. Kept open, to revisit when a use case needs
  it: (a) allow commands and resource writes, applied at the next or a later sync point, with lookups read under the
  structure epoch; (b) the world waits for remote finalizers inside the sync point, exact timing for about a 10 µs
  round trip per sync point with such stops.

### Struct observers and mailboxes

A joined thread posts its query once at subscribe; the first value comes later, as `Observe` allows. The world's thread
subscribes its own observer for it, so the cheap candidate check it runs today (`observers.ts`) runs for it, one branch
while no joined thread observes, and each value the observer gives is written into that subscription's mailbox
(`mailbox.ts`): a triple buffer in shared memory, three slots and a shared index with a fresh bit, swapped with
`Atomics.exchange`, so the writer never waits and the reader takes the newest complete slot; a reader that falls behind
skips to the newest value. Each slot has a header with its offset and capacity; only the writer grows a slot, and only
the one it's writing, freeing the old block, so the slot a reader holds never moves. The mailbox's offset is posted once
the world's observer subscribed. Results carry resource values, listed entity components each with a presence flag, or
the entity list of `select`, in the layouts of their schemas; never objects. One `Atomics.notify` per thread per batch of
deliveries, and none for a thread that hasn't read the last. An observer on a joined thread that reads objects, as a
resource, a listed component of a thread it doesn't fill, or `where` and `order` read values, throws at subscribe;
`required` and `not` read only presence, which is shared. A whole-entity observer (`observe.entity(entity)` without
options) on a joined thread gives its struct components and its own threads' objects, those the thread had registered
with ids when it subscribed. An entity observer, listed or whole, gives its thread's own objects so: the world's value says which are
present, and the thread reads them from its columns, at the entity's location read under the structure epoch, once its
mirror is through the sync point the world last delivered observers through, and keeps the value only while no newer
one waits, so its structs and objects are of one sync point; meanwhile, it holds the value and evaluates it again when
the epoch turns even or the next delivery is recorded. An observer of objects on the world's thread reads none of a
joined thread's: listing one, or reading one in `where` or `order`, throws at subscribe, and an entity's whole value
leaves them out. A subscription the world can't make, such as one naming a key it never imported, is an `"observer"`
failure in its next run's report.

### Structure epoch

One shared word, the layout directory header's fourth, kept while a joined thread holds claims: odd from the start of
each sync point that applies anything, before `materialize`, until its directory writes and logs' publishing at the
end, a window that includes commits of staged spawns and any GPU readback, and around flushes between sync points.
It turns odd by an atomic add, so later writes can't be seen before it, and even by a store, since only the world writes
it. Threads that read entity locations outside a task, observers of their own objects and rebuilds, read while it's
even and check it again after, retrying on a change; the closing check is an atomic add of 0, so every read before it
completes first. A reader that finds it odd counts itself in the header's waiters word and waits on the epoch, which
the world notifies when it turns even only while a reader waits, rather than spinning. The guarded words (`archetype`,
`row`, `generation`) are read with `Atomics.load`. Values are never guarded by it: scheduled reads are ordered by
tiers, and observers read published results.

### Tails

Tails at the end of tick N sit just before the head of tick N+1, and ordinary scheduling applies across that boundary
(`tails.ts`, the thread's in `thread-systems.ts`). A tick posts its tails after its sync point, those of each joined
thread as one task, in schedule order, once that thread's last task finished, so a tail reads the tick's values as of
its sync point. A tier in N+1 that writes what a tail reads waits for the tail's reads, which end when its body ends: a
struct component it reads or filters on, or a struct resource it reads, conditions or filters on, written by a system,
a reduction, a GPU readback, or the world's own clock. A sync point counts as a write to everything a tail reads, from
its `materialize` on, since growth frees blocks the same sync point may reuse. A run is a transaction, so it waits for
its tails before it resolves, with their failures in its report.

- **Claims.** A tail's work is numbered: position 0 is its head, which checks its conditions and resolves its
  resources, and positions from 1 are its matched archetypes' rows in order. It claims positions in chunks of 64 with
  `Atomics.add` on a progress word in its block, and stores the position it read through after each chunk; the world
  stored its end when it posted it.
- **Fallback snapshot.** Sometimes a conflicting writer is ready before the tail has finished its reads, as when main
  is late. The world's thread then evaluates the tail's head as the tail would, copies the declared linear struct reads
  of the passing rows from the position the tail reached, with their position, archetype, row and entity, and its
  linear resources, into a tail buffer, a column at a time; exchanges the progress word for a sentinel; and waits until
  the tail is done through what it had claimed, at most one chunk, spinning briefly before it waits. A claim that
  returns the sentinel reads the rest from the copy, rows from its own position on. The values are the same either
  way, so this stays deterministic. A prompt main never copies.
- **The tail's own objects** are read where they are: while a tail is in flight, the thread's replay stops at the sync
  it names, which the world stores in the log header as it posts it, so the next sync point's moves wait in the log until the tail finishes. Rows read from the copy take their
  objects from the mirror at the copy's rows, or, once its log lapped and it rebuilt past that sync, by entity. Objects
  it writes from the copy go back to the mirror after its body; the world marks their tags the thread's own when it
  copies, and stamps them changed at the tail's tick, as the task's completion names them by entity, before the
  thread's next task.
- **What waits for a tail to finish:** the next task on its thread, and what moves rows a tail may still read outside
  a sync point: registration, resources added between runs, a GPU device change, and joined threads joining or leaving.
- **Report.** A tick ends in two steps: its tiers and sync point, which release the world's queue so N+1 can start, and
  its report, written to the `report` resource once after its tails, and every earlier tick's, so their failures are in
  it. A tick whose systems read the `report` resource waits for the last tick's tails first.

### Transfers

A `transfer: true` value goes from a joined thread to its component's thread through `run(system, input)`: the value
is in the input, posted with its transfer list on a channel the world sets up between joined threads, and the run's
slot is held until that thread acknowledges receipt. Runs from that thread land in call order, so later ones
wait behind it; the world's thread never waits on delivery. A value whose command drops is released on its thread.

### Without cross-origin isolation

Memory isn't shared, so the world runs inline, and `share` and `join` throw.

## Cost

| Common operation | Cost |
|---|---|
| Iterating rows, struct or object, on any thread | as today: no added load per row |
| A quiet loop | nothing: no tick, no delivery, workers parked |
| A run | its own sync point, in call order; the next beat ticks |
| A sync point with growth, other threads joined | one directory record per changed archetype; a message only for new archetypes or components |
| A task on any thread | one load per archetype it touches, of its record's version |
| A tier on a thread other than `world` | one task posted and waited for; consecutive tiers on that thread are one: `handoff` 11.5 µs a tick of five, `fused tiers` 7.5 µs a tick of one, in node |
| A blocking tier on main | main's event-loop latency, which the report warns about |
| A terminal tail on main, prompt | one post; nothing copied; the next tick waits only if main is late at a conflict: `tail prompt` 18.4 µs a tick of a 1,000-row tail, in node |
| A terminal tail on main, late at a conflict | a copy of the declared struct reads of its unclaimed passing rows, a run of rows at a time, and a wait of at most one chunk: `tail late snapshot 10K` 6.7 ns a row of a vec3 and a mat4, in node |
| Commands and staged spawns from a worker kernel or joined thread | ring writes; the private spill and its message only past the ring's size |
| `run` from a joined thread | one slot and notify; resolves through a word |
| Struct observers on a joined thread, per tick | candidate check on the world's thread, a mailbox write of changed results, at most one notify |
| Structural change touching archetypes with remote objects | one log entry per row moved, replayed once on that thread, `log replay` 21 ns a move in node |
| A thread rebuilding after its log dropped entries | a pass over its archetypes' rows, `log rebuild 100K` 3.2 ns a row in node |
| An observer of a joined thread's own objects, per value | its mailbox value, then a location read under the epoch and a column read |
| Despawning entities with remote finalizers | stop-list copy of declared reads, a column at a time; the world's thread doesn't wait: `despawn objects 10K` 83 ns a despawn in node |
| A transferred asset | one message, loader to its thread; one run |

## Memory

- **Directory:** a header; a table of record offsets; a record per archetype, 24 bytes plus 32 bytes per storage.
- **Rings:** per pool worker, a task ring; per joined thread with claims, a task block of four lines with its payload
  and completion, sized to the largest task; and per thread, a command ring sized to the largest tick's commands and
  staged spawn rows, from 64 KiB, grown at sync points to the high-water word.
- **Move log:** a 64-byte header and 16 bytes per entry, max(4096, the thread's rows) rounded up to a power of two; on
  the world's thread, 4 bytes of tag per row of each remote storage, beside its ticks; on the joined thread, its columns
  and ticks, and 8 bytes per row of the archetypes it holds objects of, for its entity column.
- **Joined threads:** per thread, its control words and 64 run slots, 16 KiB.
- **Mailboxes:** per subscription, its control words and three slots, each sized to the largest result delivered.
- **Tail buffers:** only once a fallback snapshot was taken: passing rows times their declared struct reads, kept for the next.
- **Stop lists:** per sync point with stops, a 16-byte header, and per finalizer 16 bytes and per stop 16 bytes, 4 per
  object read and its linear reads' bytes, each column on 8 bytes, kept until a later block is acknowledged; and on the
  world's thread, 4 bytes per entity index up to the highest held.

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
  staged into batches per component set on the main thread and workers, returned per chunk and committed in merge
  order, with entities reserved in blocks whose unused positions the sync point returns; `terminate` waits for workers
  to leave their windows before releasing the pool's control state to the arena.

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

### Built: phase 2, thread ports and node workers

`pool.ts` takes ports and `worker.ts` its scope's channel, as above, so real-thread tests and benchmarks run in node,
and pool workers can be nested workers of a world on a worker, or workers the main thread lent. A port's terminate is
async, as `pool.terminate` is, which still releases control state only once every windowed worker has left. Worker
counts come from the port's platform, not `typeof Worker`. A ring task naming the idle kernel, -1, runs nothing: the
`wake` benchmark's round trip. A registration that fails waits for its other kernels' loads to settle before it rolls
back, so none finishes after it and leaves workers' kernels behind the main thread's.

- Interface: none. Contract: none.
- Tests: the worker browser tests' cases (workers, the layout directory, the pool and its size, dispatch, reductions,
  observed stamps, `up`), moved into fixtures, in node and chromium; a worker killed mid-task from outside, by ending it
  in node and by its owner in both, fails that run and every later task on it, and `dispose` finishes; a world on a
  worker gives the main thread's results with nested workers and with workers main lent it; a failed registration
  keeps workers' kernels in step whichever of its kernels fails to compile.
- Must not regress: every `workers` benchmark.
- New: in node, `move workers`, `follow workers`, `spawn bulk kernel workers` and `sync point grow 100 archetypes
  workers`, with node's environment measuring every worker's copy bandwidth; `wake` (a notify from the world's thread to
  a waiting worker and back, N = 10,000), node and chromium. Node's other benchmarks pin `workers` to 0, so they go on
  measuring the world's thread.

### Built: phase 3, command rings for the pool

Worker kernels write their commands into their worker's ring as a `CommandBuffer`'s columns, with merge tags, values
as bytes, tags for the rest, and their staged spawn batches as blocks with their unused reservation ranges; the spill of
a segment past the ring's size and the needed word; `CommandBuffer`'s byte values, which `writeRange` copies and the plan's references, finalizers and holder-index
changes decode. `FromWorker` carries a task's completion, ring extent and error, and a spill. The world's own commands,
the sync point's commit of staged rows and its plan's order are unchanged. Kernel setups carry only linear components'
starts, the rest being the world's to resolve, and `terminate` waits for every worker that ran a task by message, as
for windows, since rings are in the control state.

- Interface: none. Contract: a kernel giving a tuple or struct to a component without a linear layout fails at
  registration.
- Tests: the existing merge tests, commands and staged spawns at 0, 1, 2 and 7 workers, in node and chromium; a task
  that overflows its ring spills in order, the ring grows at the sync point and the next run doesn't spill; a failed
  task's commands and spawns before its failure still apply; unused reservation ranges return to the free list once;
  object components get their start, `null` or a number; a kernel giving a tuple to an object component fails at
  registration.
- Must not regress: `emit`, `churn`, `sync point one spawn`, `spawn bulk kernel`, `despawn bulk kernel`, `add tag
  kernel`, `remove tag kernel`, `spawn bulk kernel main`, `spawn bulk kernel workers`.
- New: `emit main` and `emit workers` (`emit`'s kernel, an add for a tenth of 1M rows), node and chromium.

### Built: phase 4, joining

`share`, `join`, the handshake with its claims and Web Lock, local numbering of keys and
items, remote `run` through run slots, sequence numbers and completion words, struct observers through mailboxes, the
resource archetype in the directory, and the structure epoch's word, which readers take up in phase 5a. Every logical
thread is still filled by `world`; a claim is recorded and checked against claims already made.

- Interface: `world.share(port)`, returning nothing, its port an inline type; `join` and its options are the
  implementation's, inferred from it.
- Contract: the first notification on a joined thread always comes later, and a slow one gets the newest value;
  `observe.entity(entity)` on a joined thread gives its struct components; an observer there that reads objects throws
  at subscribe; a joined thread's `run` of a system without an id, or of one the world never imported, rejects; a
  thread claimed twice can't join; `add` and `share` throw on a joined thread; without cross-origin isolation `share`
  and `join` throw; `share` and `join` are public.
- Tests: in node and chromium, a worker joining a world here and this thread joining a world on a worker, through
  `MessagePort`s and through a worker and its own scope, with the keys and systems of one id imported on both threads;
  runs with struct and object input landing in call order; observers of resources, entities, select and count; a
  joined thread that dies is `"gone"`; runs of a system without an id or never imported reject; a thread claimed twice
  is refused. On one thread through a `MessageChannel`: slots overflowing in order, an input that can't be posted, a slow
  observer getting the newest value, observers of objects throwing, runs rejecting after the world's dispose; world-only
  components rejected in systems and commands; `share` and `join` throwing without cross-origin isolation; the epoch and
  the resource record.
- Must not regress: `run idle`, `run 50 idle`, `select`, `sync point one spawn`, `loop tick idle`.
- New: `remote run` (an empty transaction from a joined thread, N = 1,000); `mailbox resource` (one observed resource
  changed per tick, N = 1,000 ticks); `mailbox select 10K` (a `select` over 10,000 entities whose order reverses every
  tick).

### Built: phase 5a, remote object columns and the move log

Claimed threads fill their object components: object columns by row on their thread (`mirror.ts`), staged slots with
their entity, component and sync, the world's storages holding each row's tag and ticks in their place (`remote.ts`),
the move log over every apply path with its added flags (`move-log.ts`), its published-through and delivered-through
words, replay with its lap check, and rebuild from the directory's counts and the tags; entity observers of objects on
their thread, reading locations under the structure epoch as of the sync observers were delivered through; directory
counts. The structure epoch and counts are kept only while a joined thread holds claims, and the epoch notifies only
waiting readers. A claim whose systems or finalizers exist is refused until 5b and 5c, which the joined thread's
commands and runners come with; until then a slot is staged only through the mirror's `stage`, and the world names it in
a command buffer as a thread's ring will.

- Interface: none. Contract: commands may give another thread's object components only their start or `null`: a
  spawn's other value throws when issued, an add's drops at its system's end, which fails; observers and systems on the
  world's thread can't read them; when the thread is gone, they come back to the world's thread, `null` or the start.
- Tests: a property test of random spawns, despawns, adds and removes, single and list forms, through the commands
  world-thread systems get, on archetypes holding objects on another thread, with values that thread stages through
  its staging array, removed again in the same sync point now and then, before and after world commands in merge
  order, comparing its values and ticks with an inline world's after every sync point by a stable id component, with no
  pool workers, replaying the log and with the log forced to drop; a dropped slot settled without a value; locations
  read only while no sync point applies and once observers were delivered through; counts in the directory; in node and
  chromium, a worker watching an entity whose objects change and move archetype every tick while the world ticks back
  to back, every value's objects agreeing with its structs; on one thread through a `MessageChannel`, observers of the
  thread's objects at their starts and `null`, listed and whole, commands and kernels giving them other values failing,
  observers and systems here unable to read them, a claim refused for a thread whose systems or finalizers exist, and
  the objects coming back once the thread is gone.
- Must not regress: every benchmark, inline.
- New: `log replay` (10,000 swap-removes and moves per sync point, time per move); `log rebuild 100K` (a forced
  rebuild over 100,000 rows).

### Built: phase 5b, blocking tiers

Systems on claimed threads run there (`remote-systems.ts`, `thread-systems.ts`): runners over the world's archetypes as
the directory gives them and the thread's objects in its mirror, accessor rows shared with the world's thread's
(`rows.ts`), resources there, object resources of claimed threads included, lookups, change filters over the shared
ticks, conditions, reductions' folds in the completion, and commands and spawns into the thread's command ring, values
for its own objects staged as slots, keys the world gave it no number for by its own. Tasks go through each joined
thread's task block, one in flight, consecutive tiers on one thread fused, both sides spinning briefly before they wait;
`"thread"` failures and `warnings`. Claims check by id that the joined thread imported the systems placed on it, and
systems are placed on the world's thread again, keeping their `lastRun`, once it's gone. The objects' ticks are the
world's storages' alone, which the thread's writes stamp, marking the row's tag its own, so a rebuild keeps the value. A
joined thread reads again rather than wait while its unread word is set, which lost wakes before.

- Interface: the `"thread"` failure kind in `World.Report`'s `Failure` and the `report` resource's schema; `warnings`
  in `World.Report`, each `{ kind: "blocking", name, message }`, its type inline, in the schema too; both type-tested.
- Contract: a blocking tier is listed in its run's or tick's `warnings`; a system on a claimed thread runs there, and a
  joined thread's claim is refused for a system there it can't run, one it didn't import, one without an id or naming a
  key without one, or one declaring `up`; a system whose thread is gone is in `skipped` with a `"thread"` failure, later
  tiers running; a command on a joined thread giving another thread's object a value other than its start or `null`
  drops, failing its system, and a spawn throws; the world's thread can't observe a joined thread's object resources.
- Tests: on one thread through a `MessageChannel`, systems on a joined thread giving an inline world's values, reports
  and resources over ticks, fused and mixed tiers, a run with input, a failing run and a condition; a value the thread's
  systems wrote kept once its log lapped and it rebuilt; commands that can't cross; systems skipped once their thread is
  gone, then run on the world's thread. In node and chromium, the same against a joined worker; a worker ended mid-task;
  a claim refused for a system the worker never imported; ticks of world systems while the worker never yields; 30K
  ticks of a system on the worker back to back, which stopped once a wake was lost.
- Must not regress: every benchmark, inline: within noise, but `mailbox resource`, which now times a joined observer
  that keeps up, 3.5 to 5.5 µs a tick in node and 6.1 to 8.7 in chromium.
- New: `handoff` (10 tiers alternating `world` and a joined worker, empty systems, N = 1,000 ticks), 11.5 µs a tick in
  node and 13.2 in chromium; `fused tiers` (10 consecutive tiers on a joined worker), 7.5 and 9.4 µs.

### Built: phase 5c, remote finalizers

Finalizers on claimed threads run there (`stop-lists.ts`, `thread-finalizers.ts`): placed as systems are, with their
setups posted, one created after a claim placed when it activates; stop lists written before apply, a column at a
time, one block per sync point linked in sync order, and the thread woken; finalizers run as the thread replays each
sync, before its entries apply, or before it rebuilds once its log lapped, against its objects by tag and entity;
replay held before a sync whose finalizer's setup hasn't arrived; "finalized through" acknowledged in the log header;
indexes of despawned entities held, counted by index, until every thread finalizing them acknowledged; held indexes
returned and unacknowledged stops reported once the thread is gone; what was published finalized before a thread
leaves, and every match once the world is disposed. Claims check by id that the joined thread imported the finalizers
placed on it.

- Interface: a finalizer on another thread than the world's has no `commands` in its context, and writes no resources
  and looks up nothing, in types and at creation; a changes finalizer watching or reading another thread's values is
  rejected in types and at creation; finalizers hold any body, as systems do, their parameters checked where created.
- Contract: such finalizers run after the sync point, under the guarantee above, their failures in a later run's
  report; a finalizer ordered with one on another thread is rejected at creation; a claim is refused for a finalizer
  there the joined thread can't run, without an id, naming a key without one, or not imported; one created after the
  claim that the thread can't name doesn't activate, reported once; stops of a thread that's gone are `"thread"`
  failures; once the world is disposed, a joined thread finalizes every row its finalizers match.
- Tests: types and creation rejecting what can't run on another thread; on one thread through a `MessageChannel`, an
  inline world's stops, with structs as before the sync point applies, the thread's objects at their starts, `null`,
  written or staged, and its object resource, after its log lapped too; a finalizer placed by its object resource alone;
  an index reused only once its stop was finalized (red without holds); failures there in a later report; finalizers
  created after the claim, one without an id reported once; every match finalized there once the world is disposed;
  stops published finalized when the thread leaves, then finalizers on the world's thread. In node and chromium, the
  same stops against a joined worker; a worker that never yields holding indexes, which are reused and its stops
  reported once it's ended.
- Must not regress: every benchmark, inline.
- New: `despawn objects 10K` (a sync point despawning 10K entities whose objects a joined worker fills, a finalizer
  there reading the object and a vec3), 83 ns a despawn in node, against 77 with the finalizer run inline.

### Built: phase 6, tails

Terminal systems proven by the plugin (`compiler/terminal.ts`) and run as tails after their tick's sync point on their
joined thread (`tails.ts`, `tail-blocks.ts`, `thread-systems.ts`): claims in chunks, conflicts resolved at later tiers,
the clock, GPU readbacks and sync points by fallback snapshots, waits only for the claimed chunk, the thread's replay
bounded by the task in flight, writes from a snapshot returned to the mirror and stamped by the world, ticks resolved
in two steps.

- Interface: none.
- Contract: a tick's report includes its tails' failures, written once after them, and after every earlier tick's; a
  run resolves once its tails ran, with their failures; a terminal system on a joined thread that no later system
  conflicts with runs after its tick's sync point, unlisted in `warnings`.
- Tests: the plugin marking bodies that never reach `commands`, and not those that may; on one thread through a
  `MessageChannel`, tails unwarned, each seeing one tick's values, a run waiting for them, a body reaching `commands`
  blocking its tier, a tail that throws in its run's report and its tick's `report`, and tails skipped with a
  `"thread"` failure once their thread is gone; in node and chromium against a joined worker, a terminal main system
  over 1,000 rows while the world ticks back to back, every run seeing one tick's values, read in place, from a
  snapshot when late, and both across a switch at a chunk (red without snapshots: 9,640 rows of another tick's values);
  a prompt main never snapshots; a sync point spawning 20,000 rows into what a late tail reads, its labels written from
  the snapshot kept and stamped (red without stamps).
- Must not regress: `run idle`, `move main`, `main thread`, `loop tick idle`.
- New: `tail prompt` (ticks of a world system and a 1,000-row tail on a joined worker that keeps up, N = 1,000 ticks),
  18.4 µs a tick in node; `tail late snapshot 10K` (a run writing what a late tail of 10,000 rows of a vec3 and a mat4
  reads, the copy's cost), 6.7 ns a row in node.

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
- **Liveness polling of joined threads:** a quiet world does no work, so death is what the platform reports, a joined
  thread's Web Lock included.
