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
- **Kernel systems (`kernel: "cpu"` or `"gpu"`) are compiled at build time.** A Vite/Rolldown plugin compiles them in its `transform` hook, after TS types are stripped and before minification, so names are never mangled and nothing is parsed at runtime.
  - It finds systems by resolving the import binding of the system factory.
  - From one parse it emits a compiled kernel (efficient JS; later WASM and WGSL) and the inferred read/write sets, which are checked against the declared signature.
  - **The plugin is required for kernels.** Registering a kernel system that wasn't compiled throws. Non-kernel systems run as written on the main thread, through accessor rows over the same storage.
  - **Workers:**
    - The plugin emits each kernel as its own chunk and attaches its `new URL(..., import.meta.url)` reference to the system.
    - On registration, workers `import()` each kernel and cache it by system name.
    - Each run posts the system name, chunk ranges and arguments. Workers receive the `SharedArrayBuffer` handles at startup and again after any sync point that reallocates.
  - **Worker count** comes from the platform (`navigator.hardwareConcurrency` minus the main thread). It's not part of the API.
  - **`SharedArrayBuffer` requires cross-origin isolation** (COOP/COEP headers). Without it, every system runs on the main thread.
  - **Subset errors** are reported at build time. An ESLint rule shares the same validator, so errors also show in the editor.
- **GPU systems.** `World.create({ systems, gpu: { device } })` gives a world the app's device, which it never destroys.
  - **`kernel: "gpu"` declares a GPU kernel.** It runs as a WGSL compute shader compiled from the same Program IR as WASM in a world with a device, and as a `"cpu"` kernel in one without, so it stays portable. Each rule is checked as early as it can be known: types rule out lookups, change filters and commands; the build rejects loops and anything that keeps the body from lowering to a Program; registration rejects f64 or byte values, in every world, since such a declaration can never hold.
  - **Render systems** (`System.render`) run once per run on the main thread in schedule order, read-only. They record into the run's encoder over the GPU copies of their query's components, one table per matched archetype. `Gpu.wgsl(system)` returns their shaders' declarations: the world's bind group at the group they name and a function per component (`fn position(row: u32) -> vec3<f32>`), from schemas alone, so shaders can be written before a world exists. Pipelines take `world.gpu.layout`; bind groups and buffers stay the world's, so they can be replaced as storage grows.
  - **Residency:** a separate GPU heap holds copies of only the storages GPU systems use. Each copy tracks rows the CPU changed since its upload and rows the GPU wrote since its readback. GPU systems upload what the CPU changed first; CPU systems read back what the GPU wrote first. A sync point reads back only archetypes whose existing rows it moves or writes (despawns, adds, removes); spawns only append rows, which are uploaded alone, and a copy that outgrows its block moves on the GPU. GPU-to-GPU chains and rendering never copy back.
  - **Change filters:** a GPU kernel's writes stamp each written column once with the run's tick, and `changed` filters pass a whole column when its stamp is newer than their `lastRun`, so writes on the GPU cost nothing per row on the CPU.
  - **Ordering:** a queue write lands before recorded but unsubmitted work, so recorded work is submitted before each upload. Each run's encoder is submitted at its end, before the sync point; `run` resolves then, not when the GPU finishes.
  - **Reads outside runs** see values a GPU kernel wrote only after `await world.synchronize(components)`, queued with runs.
  - **GPU errors:** a run's GPU work, its render bodies' included, runs in validation and out-of-memory error scopes; the first error they report makes the next run reject, since waiting for them would hold every run until the GPU process catches up. A lost device makes later runs reject.
  - **Numbers on the GPU:** arithmetic is f32. Integer column reads, bitwise operators and locals assigned only integers stay i32 or u32, so integer chains keep every bit, and stores wrap as in JS. WGSL is the standard where JS differs only for NaN or infinite inputs or results: WGSL leaves those indeterminate, and GPU kernels use its own `min`, `max`, `%`, truthiness and conversions there. Where JS differs for finite values, as `Math.round` and `**` do, the GPU keeps JS's result; the math types follow WGSL instead.

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
  - **`kernel: "cpu"`** opts a system into being compiled, so it can run in chunks across workers; **`kernel: "gpu"`** narrows the subset so it can also run on the GPU. The term comes from CUDA, WebGPU and Taichi.
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
   - **Imported functions:** kernels call pure functions and use constants from any module the build resolves to a file, the kernel's own module included: user TypeScript or JavaScript, other packages' ESM, and the package's math types. The plugin reads each module a kernel reaches, with types stripped, follows its imports and re-exports, and inlines each call compiled in its own module's scope, so tuples are scalarized and never allocate, on JS, WASM and the GPU alike. A function outside the subset fails the build at the kernel's call, with a frame naming the file and line of each inlined function down to the failure. Recursion fails, also across modules. A module's constants must be known at build time: a `let`, or a mutation at runtime, isn't seen. Editing an inlined file compiles its kernels again, in dev too.
   - **Math types:** the package exports math types that are also namespaces of functions: `Vec2`, `Vec3`, `Vec4` (each `F32`, with `I32` and `U32` nested beside it), `Quat`, `Mat4x4`, and the scalars `F32`, `I32`, `U32`, each with a `schema`. They follow WGSL's semantics, and where WGSL leaves a result indeterminate they do what is fastest: integer vectors wrap, `round` rounds halfway values to even, `mod` is `x - m * floor(x / m)`, and `normalize` of a zero vector is NaN. Integer functions are defined for integers in range, and `pow` for a positive base; other inputs give indeterminate results, which may differ between the CPU and the GPU. The few that throw (`Mat4x4.inverse`, `Mat4x4.perspective`, `Mat4x4.lookAt`) can't be used in kernels.
   - **WGSL builtins:** a math function whose WGSL builtin matches it declares that explicitly, in its own file (`intrinsic({ wgsl: "normalize", parameters: ["vec3f"], result: "vec3f" }, implementation)`). In a GPU kernel a call to it becomes an intrinsic region holding its operands and its inlined body: WGSL emits the builtin on vector and matrix types, nesting calls as builtins do, and JS and WASM run the body, so CPU output is unchanged. Locals keep their JS names in WGSL, and a region's result is named after its function.
   - **Helpers return early:** a `return` inside an `if` splits the block, each branch running its own statements and then the rest, and the values merge as a conditional's do.
   - Still open:
     - The exact grammar (see `src/compiler/` for the subset as implemented).
   - **Value semantics** for tuple and struct locals, matching component values: locals are scalarized to one local per leaf.
2. **Reduction construct.** Its shape, and how partial results combine.
3. **Non-local matching.** Relationship pairs with variables (`(ChildOf, $p)` where `$p` has X) depend on another entity's archetype, and sparse-set components aren't part of the archetype. Should monitors support these, and how?
4. **GPU systems.** Pure value reads and writes into component tables, with no structural commands, so the GPU never needs command buffer communication. Still open:
   - **Latency.** Whether a system can declare that its writes become visible to CPU readers only at a later sync point, so readback overlaps the next frame.
   - **Device loss.** Components ahead on the GPU are lost with the device; decide whether a world can fall back to its last CPU copy.
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

Measured with `pnpm perf` (benchmarks bundled as in production, on plain node) and `pnpm test:perf` (adds chromium with workers). vitest's node transform makes every imported binding a getter, so JS-heavy paths measure about twice as slow there.

### In place

- **Commands:** typed parallel arrays with explicit counts, reused per system across runs; ids resolved when issued. Kernels issue commands through `begin`/`value`/`component` by key index, allocating nothing. Workers post the same buffers back.
- **Sync point:** plans straight over the queued buffers into reusable typed arrays, through cached archetype edges (arrays by component id), an eight-shape spawn cache, and per-pair move lists; archetypes grow once per sync point; common layouts are written inline rather than through layout closures.
- **Chunk ticks:** every storage keeps the newest `added`/`changed` tick per 1024-row chunk, stamped with every row tick, so change filters skip unchanged chunks. Stamps every row reaches are made once per kernel call, per chunk.
- **Ticks only where observed:** a component has tick columns only once some registered system filters on its `added` or `changed`, and resources always do; until then nothing allocates or stamps them. Columns start at the current tick, so a new observer, starting with `lastRun = 0`, sees every row once. Kernels also drop `changed` stamps for components no system filters on with `changed`; registering an observer reloads the affected kernels.
- **Kernels where WASM can't compile** (a content security policy without `'wasm-unsafe-eval'`) run their compiled JS.
- **Change filters inside WASM kernels:** one call per archetype or worker chunk; chunks and rows are skipped in WASM.
- **Lookups in WASM kernels:** a directory per lookup in shared memory (per archetype: a match flag and column addresses), rebuilt at sync points; finds check index and generation against the shared entity table.
- **Dispatch:** WASM chunks go through a per-worker task ring in shared memory, signalled with `Atomics.notify`; workers stay in that window across runs until a message must reach them.
- **Kernels:** interleaved layouts, SIMD within rows (SLP), across dense rows, and across rows of whole interleaved elements (four tight vec3 rows are three vectors), 16-byte loads for three-lane rows with column slack, exact integer `%`.
- **Main-thread reads:** `select`/`count` compile `where` once and resolve storages per archetype; single-component reads go straight to the storage.
- **Main-thread spawns:** staged into a batch per component set and block-copied at the sync point. The plugin rewrites `commands.spawn({ ... })` with literal keys in main-thread systems into a per-site function with one parameter per value, writing each through a writer specialized to its column, so nothing is generated at runtime and nothing needs `'unsafe-eval'`. Other spawns read values by key.
- **Main-thread systems:** one accessor row per set of reads and writes, in fast properties, shared across systems and archetypes and rebound per pass; getters and setters specialized per layout; resource cells resolved once per run.

### Next

- **U32 ticks,** if tick bandwidth matters for observed components. Halves tick memory and the change-filter scan's bandwidth, which bounds uniformly sparse filters. Comparisons use wrapping subtraction relative to the current tick, with a periodic clamp pass at a sync point, like Bevy's `check_change_ticks`, covering cell, `lastRun` and chunk ticks.
- **Compiled main-thread systems.** Accessor rows copy tuples out on every read and share one megamorphic body call site; compiling main-thread systems (or a JS-only kernel mode) would remove both. A per-system loop alone measured 5–10%.
- **Kernel fusion, once real workloads show fusable pipelines.** Consecutive per-row kernels over the same archetypes, each reading what the previous one wrote at the same row, become one pass. It cuts dispatch and memory passes: chain 6×1M spends its time streaming 12 MB six times. Fusion must keep each system's tick, `lastRun`, change filters and command order.
- **WASM commands.** Encode kernel commands into a shared-memory buffer from WASM, so command-issuing kernels get WASM and the fast dispatch path. Measured at 18% on emit for a large change while the sync point dominates, so it waits for a faster sync point.
- **Per-archetype query-match bitsets.** Compute stop/start for each move as `match(from) & ~match(to)` in O(Q/32). Memory scales with archetypes, not archetype-graph edges.
- **Per-archetype rule-closure cache.**
- **Main-thread fast path.** Main-thread structural changes may skip the command buffer, or be applied early, only when no system or finalizer could observe the difference before the next sync point.
- **Early cutoff.** Compare before writing (`set_if_neq` / backdating), so equal writes don't mark `Changed` and don't trigger recompute through everything downstream. Decide whether the compiler emits it by default or per component.
- **Bulk operations in the plan.** Keep (archetype, all rows) or entity-ID ranges, not one entry per entity, so million-entity despawns stay cheap. Despawning a pair target bulk-moves by (source archetype, target).
- **Finalizer execution:** skip the phase when nothing is pending. Run on the main thread by default; move to workers only above a size threshold and only for linear-memory finalizers. Run main-thread and worker finalizers concurrently. That's at most one barrier per flush.
- **Gather loops.** The compiler needs an indexed-row loop mode for scattered sets, such as rows about to be removed.
- **Sparse dirty lists.** A possible option for very large columns that change rarely.
- **Archetype churn.** Derived components that toggle on and off move entities between tables. Candidates: sparse-set storage, or modeling the condition as a value.
- **GPU residency, next steps.**
  - Upload only changed chunks, by making the GPU copy an observer of `changed` ticks; today a CPU write or a sync point that touches an archetype uploads its whole columns.
  - u32 tick columns on the GPU, relative to an epoch rebased at sync points, so GPU kernels can stamp rows and use change filters.
  - Apply the structural plan on the GPU as row-copy lists run by a move kernel, instead of reading back first.
  - GPU kernels with change filters, lookups and loops.
  - One dispatch over several archetypes, and indirect draws; heap segments past `maxBufferSize`; automatic placement.
  - Finalizers on components ahead on the GPU: until then, the sync point reads them back first.
  - Read back only the rows a sync point moves, rather than whole disturbed archetypes, or move them on the GPU.
- **GPU-only components, not planned until a workload needs one.** A const meta tag on the component entity (components are entities), so its values have a column in the GPU heap and none in the CPU arena; entities, archetypes and `has`/`not` stay on the CPU. Values given at spawn are uploaded once; otherwise rows start at the schema default.
  - **The use case:** GPU state with history that nothing on the CPU reads, such as a simulation integrated only on the GPU, previous-frame transforms for motion vectors, or accumulators. Data recomputed every frame (culled lists, indirect draw arguments, sort keys) isn't state: render systems own those as scratch buffers. Cached derived data (world matrices, skinning palettes) is an optimization, not a need.
  - **What it adds over an ordinary component written only on the GPU,** which already stays GPU-resident and is never read back unless asked: the CPU column's memory, and a type-level guarantee that CPU systems, `read` and `query` can't name it.
  - **What it requires:** structural changes on the GPU (the move kernel above), since there's no CPU copy to move.
