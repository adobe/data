# data-ecs design

Living document. Rough plans, decisions and open hard parts. Update as decisions are made.

## Phases

- **Phase 0, the contract:** define the API and its semantics, and confirm that in principle every planned feature can be implemented under it. This phase only covers things that affect the API or whether an implementation can be correct.
- **Phase 1, functional:** a correct implementation of the full contract. Performance doesn't matter yet; it may be single-threaded and uncompiled.
- **Phase 2+, performance:** optimizations that don't change the API or its semantics, added until performance is as good as it gets. After that, the core is done.

Rule: anything that doesn't affect the API or correctness belongs in phase 2+.

## Model

- **All state lives in the ECS.** Essential state lives in components. Derived state is computed by systems, or by structural rules, into derived components. External async ports write into the ECS through commands.
- **Change detection is Bevy-style.** Each component of each entity has `added`/`changed` ticks. Each system has a `lastRun`. `Added<T>` / `Changed<T>` compare against `lastRun`, so each system sees each change exactly once, wherever it runs in the schedule.
- **Structural changes are deferred.** Spawn/despawn/add/remove go to command buffers and are applied at sync points. Value writes are immediate.

## Storage

- Structure of Arrays component storage.
- Numeric types, tuples and structs live in linear memory backed by `SharedArrayBuffer`, so workers can read and write them.
- Components that need non-linear memory (strings, variable-length arrays, objects) are **main-thread only**.
- Memory only reallocates at sync points. Structure is frozen between sync points, so workers never see memory move mid-phase.
- Removed rows stay in place until Apply. At Apply the last row is swap-moved into the hole and the entity lookup table is updated.

## Execution

- **Systems are designed to run on workers.** That is a primary constraint, not an add-on.
- **A system's declared read/write sets drive both ordering and parallelism.**
- **Systems that touch main-thread-only components are pinned to the main thread.**
- **Structural changes become visible only at sync points,** whether they come from the main thread or from workers.
- **Component values are immutable values,** deeply, by type convention rather than freezing. A system reads a value and writes a whole new one (`row[position] = [x + vx, y + vy, z + vz]`); values are never edited in place. This is value semantics, as in shading languages: no value aliases another, so the compiler is free to lower a whole-value write to per-leaf stores, as a shader lowers a struct assignment. System source is ordinary TypeScript, type-checked normally.
- **Kernel systems (`kernel: true`) are compiled at build time.** A Vite/Rolldown plugin compiles them in its `transform` hook, after TS types are stripped and before minification, so names are never mangled and nothing is parsed at runtime.
  - It finds systems by resolving the import binding of the system factory, and resolves builtins by module specifier plus export.
  - From one parse it emits a compiled kernel (efficient JS; later WASM and WGSL) and the inferred read/write sets, which are checked against the declared signature.
  - **The plugin is required for kernels.** Registering a kernel system that wasn't compiled throws. Non-kernel systems run as written on the main thread, through accessor rows over the same storage.
  - **Workers:**
    - The plugin emits each kernel as its own chunk and attaches its `new URL(..., import.meta.url)` reference to the system.
    - On registration, workers `import()` each kernel and cache it by system name.
    - Each run posts the system name, chunk ranges and arguments. Workers receive the `SharedArrayBuffer` handles at startup and again after any sync point that reallocates.
  - **Worker count** comes from the platform (`navigator.hardwareConcurrency` minus the main thread). It's not part of the API.
  - **`SharedArrayBuffer` requires cross-origin isolation** (COOP/COEP headers). Without it, every system runs on the main thread.
  - **Subset errors** are reported at build time. An ESLint rule shares the same validator, so errors also show in the editor.
- **GPU execution is a design goal in principle.** Some kernels should be able to run as WebGPU compute shaders, so the contract must not rule it out.

## Phase 0: contract decisions

- **Change-tick granularity:** two ticks (`added`, `changed`) per component, not per field. Writing any field marks the whole component changed.
- **`Changed` is conservative:** it never misses a change but may report a component whose value is unchanged. Consumers must treat it as "may have changed", which keeps early cutoff a pure optimization.
- **System bodies can't carry state from one row to the next.** Cross-row results (sums, counts) need an explicit reduction construct, so work can later be split without changing semantics.
- **Systems are identified by module + export.** Closures can't cross threads, so configuration is passed as data.
- **Components and resources:**
  - Each is identified by an exported key, a `string` or a `unique symbol`. Its type comes from augmenting `Component.Types` or `Resource.Types`. Registering its schema (`Component.register`, `Resource.register`) is a side effect of loading its module.
  - **A resource always has a value,** so its schema requires a `default` of the resource's type.
  - **Import and use:** code that references a component or resource always imports its key. That one rule covers strings and symbols alike, and it guarantees the module is loaded, so the component is registered.
  - **Names are unique across components and resources,** because a resource may be stored as a component on a single entity. A symbol's description is its stable name, used by persistence and replication, so it's required and must be unique. A duplicate throws when it is registered.
- **Systems** (`src/system/`; its type tests pin the behavior):
  ```ts
  export const follow = System.create({
    name: "ai/follow",                       // registered by augmenting System.Types: { "ai/follow": true }
    query: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
    after: ["physics/integrate"],
  }, (row, { targets }, commands) => {
    const other = targets(row[target]);
    if (other !== null) row[velocity] = Vec3.subtract(other[position], row[position]);
  });

  export const move = System.create({
    name: "player/move",
    args: { type: "object", properties: { distance: { type: "number" } } },
    query: { has: [player], write: [position] },
  }, (row, { args }) => { /* … */ });

  export const main = System.composite({ name: "main", systems: [input, physics, follow, render] });
  ```
  - **`System.create` and `System.composite` are identity functions.** They return the system as data and exist for body type inference, a binding the plugin can find, and a value the world can register. Nothing runs when they're called.
  - **Query:** a system matches entities that have every component in `read`, `write`, `has`, `added` and `changed`, and none in `not`.
    - A component in both `read` and `write` is read-write.
    - A component in `write` only is write-only. `tsc` can't enforce that, so the build validator does.
    - `added`/`changed` pass when **any** of the listed components was added or changed.
  - **Lookups** are named and read-only, and take an entity ID only: `(entity) => values | null`. They have no change filters and can't be iterated.
  - **Resources:** listing a resource in `changed` makes the filter pass for every row. Kernels can only read resources.
  - **`kernel: true`** opts a system into being compiled, so it can run in chunks across workers (and later on the GPU). The term comes from CUDA, WebGPU and Taichi.
    - It's explicit rather than inferred, so a body that leaves the subset fails the build instead of silently running on the main thread.
    - Type-checked: values in `query` and `lookup` must be linear (numbers, booleans, entities, fixed-length tuples, and structs of those), and resources are read-only. Presence-only lists (`has`, `not`, `added`, `changed`) can name any component.
    - The build validator checks `args`, since `Schema.ToType` doesn't produce tuples.
    - Without `kernel`, a system is plain JS on the main thread.
  - **`query` is optional.** A system with no query is resource-only: it runs once per run, on the main thread, and its `row` is `undefined`.
  - **`args`** is a schema for a per-run, read-only input, and `run` requires the arguments exactly when it's declared.
    - A system with arguments can't use `added` or `changed`, because its `lastRun` is shared across runs that receive different arguments.
    - It can't be a member of a composite yet.
    - `(system name, arguments)` is a replicable transaction. On a GPU, arguments map to a uniform buffer.
    - A `Blob` argument can only be stored or forwarded, because its contents can't be read synchronously.
  - **Body:** `(row, context, commands)`.
    - `row`: `{ readonly entity }`, plus `read` values (read-only) and `write` values (writable). No component may be named `entity`.
    - `context`: lookups, resources and `args`, flattened into one object. A lookup named after one of the system's resources, or named `args`, is a type error.
    - `commands`: `spawn` (returns a real `Entity`), `despawn`, `add` (adds or replaces, marking the component changed) and `remove`. They apply in the order they were issued. Rule-owned components will be excluded at the type level.
  - **Writes to the current row are direct and immediate.** Commands are only for structural changes and for writes to other entities.
  - **Names are global** and should be namespaced (`"physics/integrate"`). Ordering constraints can only name registered systems, never the system itself.
  - **Composites** flatten their members.
    - A composite's constraints apply to every member, and members' own constraints resolve against the flattened set.
    - If the same value appears twice it's flattened to one entry. Two different systems with the same name throw.
- **Scheduling:**
  - There's no built-in schedule. The app runs its main composite each frame (`world.run(main)`), and transactions or on-demand systems whenever it needs them.
  - Ordering comes from `before`/`after`/`during`, sorted into tiers. Systems in the same tier may run in parallel. A constraint that names a system outside the composite being run is ignored.
  - **Unordered conflicts throw at registration:** within a composite, two systems that both write a component or resource, or where one reads what the other writes, must have an ordering path between them.
  - **A lookup can't read a component its own system writes;** that also throws at registration. Rejecting it now means hierarchy propagation can later give it defined semantics without breaking anything.
  - To reuse a system with different placement, spread its declaration and replace the constraints.
- **World** (`src/world/`):
  - `World.create()` returns a world synchronously. `World.create({ systems })` is `create().systems.register(...systems)`, so it returns a `Promise`.
  - `systems.register(...systems): Promise<World>` resolves once worker kernels are loaded, so failures show up at registration and the first run doesn't stall.
    - Registration is serialized with runs, and it can happen at any time, for example for lazily loaded features.
    - Registering the same value again does nothing. A different system with a registered name throws. So does a component or resource with no registered schema.
    - Systems are registered up front, not discovered lazily, for three reasons: replication resolves systems by name, transactions shouldn't pay for setup on their first run, and systems can later become queryable entities, as in Flecs.
  - `systems.get(name)` resolves a registered system by name, for replication. Local calls pass systems by value.
  - `run(system, ...args): Promise<void>` runs a registered system or composite and ends in a sync point.
    - It's async because workers can't be joined synchronously on the main thread.
    - An unregistered system throws.
    - A system or finalizer that throws rejects the promise.
    - Each system keeps its own `lastRun`, so it sees every change since it last ran.
  - `dispose()` and `[Symbol.asyncDispose]` wait for pending runs, then terminate workers and release memory, so `await using world = ...` works.
  - Read access from outside the schedule, on the main thread only:
    - `query`: `select` and `count`. They take `include`, plus `World.Query.Options` (`not`, `where`, `order`).
    - `read`: `entity`, `component` and `resource`. A dead entity, or one missing a requested component, returns `null`.
  - Reads are valid only between runs, and they return the state as of the last sync point.
  - **Initial state** comes from the resources' schema defaults. A system with `resources: { changed: [level] }` runs on its first run and spawns the entities the level calls for, so no run-once flag is needed.
- **A sync point runs in three phases:**
  1. **Plan.** Merge command buffers in the run's sorted system order, then chunk index, never worker ID, so conflicting commands resolve the same way every run. Expand the declared cascades and the rule closure. The result is a net plan of `fromArch → toArch` for each entity, covering the whole flush, with nothing applied yet. Only the net first→last archetype matters, so an entity that passes A→B→C produces no events for B.
  2. **Finalize, once,** against the final plan, while every row is still live (see Finalizers).
  3. **Apply.** Swap-remove, insert rows for spawned entities, update the lookup table, then free entity IDs.
- **Entity IDs:**
  - **`spawn` returns a real `Entity` immediately,** on the main thread or a worker. Like Bevy, it reserves the ID from the free list with an atomic cursor. The ID can be used in commands and stored in Entity-typed fields, including the spawner's own row. The entity becomes alive at Apply; until then, lookups return `undefined`.
  - **ID values are local identity only** and are not deterministic across runs. Lockstep and rollback are not supported, because our applications use server-authoritative replication, and dropping them avoids placeholder IDs and a rewrite pass at Plan.
  - **Replication:** replicated entities carry a stable ID component that the server assigns, and each client maps it to a local `Entity`. A client-predicted spawn gets its mapping when the server confirms it. Server deltas come from whole-plan finalizers.
  - An index freed in flush N can't be reused until flush N+1, and never by reservations made before that flush.
  - Per-index side data carries the generation.
  - Commands against dead entities are no-ops and don't throw. They'll be listed in the run report once it exists.
- **Matching, not component removal, is the unit of add/remove symmetry.** An entity stops matching a query when a required component is removed, when it's despawned, or when an excluded component is added. Per-component removal is a monitored `With<T>`.
  - Monitored queries are **structural only**. Their `Changed`/`Added` filters are stripped or rejected at the type level, and optional components don't affect matching. Value conditions become tag components set by systems.
  - Replacing a required component within one flush (remove + re-add) counts as a stop plus a start.
- **Rules (structural derivation):** "entities matching Q own C" (or own a derived entity).
  - **Stratified negation:** at registration, reject any cycle in the rule graph that passes through a `Without`. Without this, rules can oscillate forever.
  - That makes the derived closure a pure function of the archetype, `closure(B) = B + derived(B)`, so A→B becomes a single move A→closure(B). Entities never match and then unmatch within a flush.
  - Rule-owned components are **structurally read-only** to user code. Their values can be written; adding or removing them by hand is forbidden at the type level.
  - A rule-added component starts with a default value that a normal `Added` system fills in later. No initializer phase is needed, because creation can wait for the next system run and removal can't.
- **Finalizers are the only removal mechanism.** They run inside the sync point and read live values, with no copying, against one consistent snapshot of state from before Apply. They are for releasing resources (GPU/DOM handles), updating indexes and adjusting aggregates, and they never miss a removal.
  - **Deferred handling:** a consumer that handles removals later appends what it needs (IDs, values) to a queue it owns during Finalize, and works through it whenever it runs. A consumer that tracks stops keeps state about the entities it saw start, and ignores stops for entities it doesn't know.
  - **Run once, against the final plan.** Their structural commands go to the **next** flush. Re-planning would let a later round bring back a component an earlier round already finalized, for example a freed handle on an entity that survives.
  - **Same-flush cascades are declared statically** (ownership relations, rules) and expanded in Plan.
  - **Writes:** they declare write sets, as systems do. Their writes use a flush tick allocated before Finalize, so each system sees them exactly once. They can't write to rows that are about to be removed.
  - **Own cursor:** each finalizer has its own `lastRun`, never shared with a system.
  - **Never-initialized values:** they must accept these, such as a rule-owned handle that is still at its default.
  - **Same-flush spawns** have no rows yet and can't be read.
  - **Throwing:** the plan still applies, and `run()` rejects.
  - **Disabled consumers:** each consumer chooses explicitly whether its finalizer keeps queuing while it is disabled, or it resyncs when re-enabled.
- **Whole-plan finalizers** see the entire net plan rather than one query's unmatches. They are for persistence, sync and structural undo.

## Phase 0: open (affects API or correctness)

1. **Kernel subset.** Kernels compile to efficient JS or WASM. Main-thread systems run as normal JS with every feature available.
   - **Parser:** the bundler's own (`this.parse`, ESTree, in both Vite and Rolldown); the compiler validates the subset on that tree, and an ESLint rule can share the validator since ESLint also produces ESTree. A second JS parser would only add size and upkeep.
   - **Closed world:** every input comes from the ECS (query rows, resources).
   - **Precision:** arithmetic has at least the storage precision. Results are not bit-exact across backends (JS, WASM, GPU).
   - **Builtins:** WGSL-style value types and functions (`Vec3<I32>`-like types, `dot`, `mix`, …) are recognized as intrinsics and scalarized, so tuples never allocate. The specific builtin set is not yet defined.
   - Still open:
     - The exact grammar (see `src/compiler/` for the subset as implemented).
   - **Value semantics** for tuple and struct locals, matching component values: locals are scalarized to one local per leaf.
2. **Reduction construct.** Its shape, and how partial results combine.
3. **Non-local matching.** Relationship pairs with variables (`(ChildOf, $p)` where `$p` has X) depend on another entity's archetype, and sparse-set components aren't part of the archetype. Should monitors support these, and how?
4. **GPU systems.** These are probably pure value reads and writes into component tables, with no structural commands, so the GPU never needs command buffer communication. Still open:
   - **Latency.** A system may need to declare that its writes become visible to CPU readers at the next sync point or later, since readback is asynchronous.
   - **Finalizers on GPU-resident components.** Finalize is synchronous, so these finalizers either run on the GPU or the sync point waits for a readback.
5. **API shapes** for rules, finalizers (per-query and whole-plan), and declared cascades.

## Additive later (no breaking change)

- **Async ports:** a port can call `world.run(applyInput, data)`. Direct `world.commands` remains an option.
- **Run report:** `run(): Promise<World.Report>`, listing commands against dead entities and systems or finalizers that threw. Decide before publishing whether a throw then stops rejecting `run()`, since that changes behavior.

- **Systems as entities:** metadata on systems, plus a query that selects which registered systems to run.
- **Arguments for composites**, passed down to their members.
- **Unregistering systems.** This needs a decision on what happens to a system's `lastRun` and artifacts.
- **Entity-typed field annotation** in schemas (e.g. `format: "entity"`), so replication and persistence can map entity references.
- **Hierarchy propagation**, for example a parent's world matrix flowing down to its children. The approach is not decided. Candidates:
  - Bevy: a dedicated system that walks each subtree depth-first, starting from the roots.
  - Depth-level passes: one pass per depth, each reading level d−1 and writing level d.
  - Flecs-style depth-ordered query: `query: { read: [local], write: [world], <modifier>: parent }`, where `parent` is an Entity-valued component. Don't call the modifier `cascade`; that name is already used for structural cascades.

  Sketch of the depth-ordered query:
  - Rows are processed in depth order, and rows at the same depth can run in parallel. A lookup of the parent sees the value the parent was given earlier in the same run.
  - A row is processed if its own inputs changed or its parent was written this run, so subtrees with no changes cost nothing.
  - Depth storage: phase 1 sorts rows by depth on every run. Phase 2 maintains depth at Plan, or in the archetype (see non-local matching).
  - A cycle in `parent` chains is reported as data.

## Phase 2+: performance

- **Per-archetype query-match bitsets.** Compute stop/start for each move as `match(from) & ~match(to)` in O(Q/32). Memory scales with archetypes, not archetype-graph edges.
- **Per-archetype rule-closure cache.**
- **Main-thread fast path.** Main-thread structural changes may skip the command buffer, or be applied early, only when no system or finalizer could observe the difference before the next sync point.
- **Early cutoff.** Compare before writing (`set_if_neq` / backdating), so equal writes don't mark `Changed` and don't trigger recompute through everything downstream. Decide whether the compiler emits it by default or per component.
- **Bulk operations in the plan.** Keep (archetype, all rows) or entity-ID ranges, not one entry per entity, so million-entity despawns stay cheap. Despawning a pair target bulk-moves by (source archetype, target).
- **Finalizer execution:** skip the phase when nothing is pending. Run on the main thread by default; move to workers only above a size threshold and only for linear-memory finalizers. Run main-thread and worker finalizers concurrently. That's at most one barrier per flush.
- **Gather loops.** The compiler needs an indexed-row loop mode for scattered sets, such as rows about to be removed.
- **Archetype-level ticks.** Each archetype stores the newest `added`/`changed` tick for each of its components, and a query skips the archetype when `archetypeTick <= lastRun`. Each of these ticks has one writer at a time (parallel systems' write sets don't overlap), so plain stores are enough, with no atomics.
- **Logical chunks.** Fixed power-of-two row ranges over the contiguous SoA columns. They are not separate allocations. Chunks serve two roles:
  - **Change summaries:** a per-component, per-chunk `added`/`changed` tick adds a level between archetype and row skipping. The compiler stamps the chunk tick once per chunk, behind a flag for conditional writes. Swap-remove sets the destination chunk's tick to the newer of its own and the moved row's at flush.
  - **Work units:** they are how one system's work is split across workers. Compiled systems take a row range `(table, start, end)`. With 64-byte-aligned columns, workers never share a cache line.
  - Chunk sizes 256, 512, 1024, 2048 and 4096 rows will be benchmarked.
- **Sparse dirty lists.** A possible option for very large columns that change rarely.
- **Ticks only where observed.** Allocate a component's `added`/`changed` columns only while a registered consumer (system filter, finalizer, persistence) uses them; untracked tags and components then cost nothing per row. It's exact: a new consumer starts with `lastRun = 0` and already sees every existing row as added and changed, so a column created at its registration can start at the current tick. Kernel writes to an untracked component stamp a scratch column or use a variant compiled without the stamp.
- **U32 ticks.** Halves tick memory, which matters because ticks are stored for every component of every entity. Comparisons use wrapping subtraction relative to the current tick. A periodic clamp pass, run at a sync point, pulls ticks older than a max age forward, like Bevy's `check_change_ticks`. It covers cell, `lastRun`, archetype and chunk ticks.
- **Archetype churn.** Derived components that toggle on and off move entities between tables. Candidates: sparse-set storage, or modeling the condition as a value.
- **Struct layout within SoA.** Each struct field as its own column, or the struct interleaved within one column? This affects compiler output and SIMD/WASM options.
- **GPU residency.** Each column is valid on the CPU (SAB), on the GPU, or both, and transfers happen only when a system on the other side reads that column, as determined by the schedule's read/write sets.
  - GPU-to-GPU system chains and rendering never copy back.
  - Only changed chunks are uploaded.
  - The structural plan is uploaded as row-copy lists and applied by a move kernel. Table growth uses `copyBufferToBuffer`.
  - Tick columns are GPU-resident too. Only the per-archetype and per-chunk summary ticks (reduced with `atomicMax`) are read back.
  - Whole-plan consumers (persistence, sync) read back on demand.
  - Main-thread-only components never live on the GPU.
- **System compilation** to linear-memory access, and later possibly WASM.
- **Parallel execution on workers.** Phase 0 must still show it can be done under the contract.
