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
  - From one parse it emits a compiled kernel (efficient JS; later WASM and WGSL) and the inferred read/write sets, which are checked against the declared signature both ways: a body can't use a key its declaration doesn't list, and a declaration can't list a key its body never uses, since that key would still narrow which entities match and hold back systems that could run alongside it. The same goes for a reduced resource the body never contributes to. Main-thread systems get the second check where their bodies index or destructure `row` and `context` only by module-scope keys, and only index or test lookup results; otherwise TypeScript's row and context types are the only check.
  - **The plugin is required for kernels.** Registering a kernel system that wasn't compiled throws.
  - **The application compiles every kernel,** its dependencies' too, against the one runtime it bundles. A library ships its kernels as source in its `dist`, uncompiled and unminified, so their code stays in the kernel subset and its errors stay readable. Non-kernel systems run as written on the main thread, through accessor rows over the same storage.
  - **Workers:**
    - The plugin emits each kernel as its own chunk and attaches its `new URL(..., import.meta.url)` reference to the system.
    - On registration, workers `import()` each kernel and cache it by system name.
    - Each run posts the system name, chunk ranges and arguments. Workers receive the `SharedArrayBuffer` handles at startup and again after any sync point that reallocates.
  - **Worker count** comes from the platform (`navigator.hardwareConcurrency` minus the main thread). It's not part of the API.
  - **`SharedArrayBuffer` requires cross-origin isolation** (COOP/COEP headers). Without it, every system runs on the main thread.
  - **Subset errors** are reported at build time. An ESLint rule shares the same validator, so errors also show in the editor.
- **GPU systems.** The built-in `gpuDevice` resource, `GPUDevice | null`, is the one device the world's GPU storage lives on, for compute and render alike: GPU buffers belong to one device, so a second device means a second world. It's an ordinary resource, given as `World.create({ gpuDevice: device })` or set later by a main-thread system; the world never destroys it. After each run the world follows it: a new device gets the GPU storage and `kernel: "gpu"` systems, after what's ahead on the old device is read back; with null, GPU kernels run on the CPU again. Render systems run only while there's a device, as if their `is` listed `gpuDevice`. A lost device makes the world set `gpuDevice` to null, as its own sync point, so nothing fails: GPU kernels run on the CPU from the CPU's copies, render systems are skipped, and systems watching `changed: [gpuDevice]` see it; GPU writes not yet read back are lost with the device.
  - **`kernel: "gpu"` declares a GPU kernel.** It runs as a WGSL compute shader compiled from the same Program IR as WASM in a world with a device, and as a `"cpu"` kernel in one without, so it stays portable. Each rule is checked as early as it can be known: types rule out lookups, change filters and commands; the build rejects loops and anything that keeps the body from lowering to a Program; registration rejects f64 or byte values, in every world, since such a declaration can never hold.
  - **Render systems** (`System.render`) run once per run on the main thread in schedule order, read-only. They record into the run's encoder over the GPU copies of the components their accessors name, which are what they read, one table per matched archetype. `Gpu.wgsl(system)` returns their shaders' declarations: the world's bind group at the group they name and a function per component (`fn position(row: u32) -> vec3<f32>`), from schemas alone, so shaders can be written before a world exists. Pipelines take `Gpu.layout(device)`, one object per device, so they can be built before a world exists; bind groups and buffers stay the world's, so they can be replaced as storage grows.
  - **Residency:** a separate GPU heap holds copies of only the storages GPU systems use. Each copy tracks rows the CPU changed since its upload and rows the GPU wrote since its readback. GPU systems upload what the CPU changed first; CPU systems read back what the GPU wrote first. A sync point reads back only archetypes whose existing rows it moves or writes (despawns, adds, removes); spawns only append rows, which are uploaded alone, and a copy that outgrows its block moves on the GPU. GPU-to-GPU chains and rendering never copy back.
  - **Change filters:** a GPU kernel's writes stamp each written column once with the run's tick, and `changed` filters pass a whole column when its stamp is newer than their `lastRun`, so writes on the GPU cost nothing per row on the CPU.
  - **Ordering:** a queue write lands before recorded but unsubmitted work, so recorded work is submitted before each upload. Each run's encoder is submitted at its end, before the sync point; `run` resolves then, not when the GPU finishes.
  - **Reads outside runs** see values a GPU kernel wrote only after `await world.synchronize(components)`, queued with runs.
  - **GPU errors:** a run's GPU work, its render bodies' included, runs in validation and out-of-memory error scopes; the first error they report is a `"gpu"` failure in the next run's report, under the system whose run submitted it, since waiting for them would hold every run until the GPU process catches up.
  - **Numbers on the GPU:** arithmetic is f32. Integer column reads, bitwise operators and locals assigned only integers stay i32 or u32, so integer chains keep every bit, and stores wrap as in JS. WGSL is the standard where JS differs only for NaN or infinite inputs or results: WGSL leaves those indeterminate, and GPU kernels use its own `min`, `max`, `%`, truthiness and conversions there. Where JS differs for finite values, as `Math.round` and `**` do, the GPU keeps JS's result; the math types follow WGSL instead.

## Phase 0: contract decisions

- **Change-tick granularity:** two ticks (`added`, `changed`) per component, not per field. Writing any field marks the whole component changed.
- **`Changed` is conservative:** it never misses a change but may report a component whose value is unchanged. Consumers must treat it as "may have changed", which keeps early cutoff a pure optimization.
- **System bodies can't carry state from one row to the next.** Cross-row results (sums, counts) need an explicit reduction construct, so work can later be split without changing semantics.
- **Systems are identified by module + export.** Closures can't cross threads, so configuration is passed as data.
- **Public types are only those a consumer writes:** the interfaces to augment, `Entity`, `Schema`, the math types, `Component.Name`, `Value` and `With`, `Resource.Name` and `Value`, `System`, `System.Commands`, `Finalizer` and `World`. The rest are inferred from the values the API returns. `@adobe/data-ecs/internal/*` exports every module's types, so declarations a library emits for those values can name them.
- **Components and resources:**
  - Each is identified by an exported key, a `string` or a `unique symbol`. Its traits come from augmenting `Components` or `Resources` in `@adobe/data-ecs` with a record per key, `[parent]: { type: Entity; reference: "owner" }`; `Component.Value<K>` is its value type. Registering it (`Component.register(parent, { type: Entity.schema, reference: "owner" })`) is a side effect of loading its module, and must give exactly the declared traits, `type` as a schema for the declared type.
  - **Traits** are strongly typed and externally extensible. A trait is defined by augmenting `Traits<N>`, whose member gives the value the trait allows on component or resource `N` (`never` where it doesn't apply), and its name is claimed with `Trait.register`, in the namespace components and resources share. An allowed value may look at `N`'s own traits and at the one component a declared value names, never map over every component, which would make type checking quadratic in the component count. Types filter by trait: `Component.With<Trait, Value?>`. Traits are a registry beside components rather than components of component entities: a trait's allowed value depends on the component it's on, which a component value can't express, and nothing reads traits on a hot path. Component entities can later project them read-only.
  - **Entities are branded numbers** (`Entity`), and every entity-typed value, nested fields included, uses `Entity.schema`, so persistence and replication find references by schema. Index 0 is never an entity: `Entity.none`, zeroed memory and entity defaults name none, and a lookup of it returns null.
  - **A resource always has a value,** so its `type` schema requires a `default` of the resource's type, unless the type allows `null`, which it then starts at.
  - **Values that aren't data** (functions, and objects with methods, such as a `Blob`, an `HTMLElement` or a `GPUDevice`) are declared by their type alone: registration has no `type`, the types require one exactly when the declared type is data, and a resource gives its `default` on the declaration unless its type allows `null`. The world stores such values as they are, so only main-thread systems use them, and persistence and replication skip them.
  - **Import and use:** code that references a component or resource always imports its key. That one rule covers strings and symbols alike, and it guarantees the module is loaded, so the component is registered.
  - **Names are unique across components, resources and traits,** because a resource may be stored as a component on a single entity. A symbol's description is its stable name, used by persistence and replication, so it's required and must be unique. A name registered again throws, unless the declaration is the same, as when a hot reload evaluates its module again.
- **Systems** (`src/system/`; its type tests pin the behavior):
  ```ts
  export const follow = System.create({
    name: "ai/follow",
    components: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
    after: [integrate],                      // imported from the physics module
  }, (row, { lookup }) => {
    const other = lookup.targets(row[target]);
    if (other !== null) row[velocity] = Vec3.subtract(other[position], row[position]);
  });

  export const move = System.create({
    name: "player/move",
    input: { type: "object", properties: { distance: { type: "number" } } },
    components: { has: [player], write: [position] },
  }, (row, { input }) => { /* … */ });

  export const main = System.composite({ name: "main", systems: [input, physics, follow, render] });
  ```
  - **A system is its name.** `System.create`, `System.render` and `System.composite` return a system typed `System<Input>`: its `name`, and the input `run` takes. Whatever else the value holds is the implementation's and isn't typed. They exist for body type inference, a binding the plugin can find, and a value the world can run. `Finalizer.create` and `Finalizer.changes` return a finalizer typed `Finalizer<Name>`, for other finalizers' `before` and `after`. `Rule.create` returns nothing, since nothing references a rule. Nothing runs when they're called.
  - **Declaration keys mirror the body's context:** `components` and `resources` say what a system accesses, each with access modes (`read`, `write`) and filters; `lookup`, `reduce` and `input` each appear in the context under the same name.
  - **Components:** a system matches entities that have every component in `read`, `write`, `has`, `added` and `changed`, and none in `not`.
  - **Conditions:** `resources: { is, not }` say whether a system runs at all: only while each resource in `is` is neither `null` nor `false`, and each in `not` is. Otherwise it's skipped, which is a success, so systems ordered after it still run, and it keeps its `lastRun`. A condition's type must allow `null` or `false`, so `0` and `""` never turn a system off; `is` makes it readable, narrowed, so it isn't also read or written. Expected absence is a condition, not a failure, which is why any real failure is still reported. Finalizers have no conditions: they release what entities hold whatever the world's state.
    - A component in `write` is readable too, so it's never also in `read`; listing it in both is rejected in types and at registration. The same holds for resources.
    - `added`/`changed` pass when **any** of the listed components was added or changed.
  - **Lookups** are named and read-only, and take an entity ID only: `(entity) => values | null`. They have no change filters and can't be iterated.
  - **Resources:** listing a resource in `changed` makes the filter pass for every row. Kernels can only read resources.
  - **`kernel: "cpu"`** opts a system into being compiled, so it can run in chunks across workers; **`kernel: "gpu"`** narrows the subset so it can also run on the GPU. The term comes from CUDA, WebGPU and Taichi.
    - It's explicit rather than inferred, so a body that leaves the subset fails the build instead of silently running on the main thread.
    - Type-checked: values in `components` and `lookup` must be linear (numbers, booleans, entities, fixed-length tuples, and structs of those), and resources are read-only. Presence-only lists (`has`, `not`, `added`, `changed`) can name any component.
    - The build validator checks `input`, since `Schema.ToType` doesn't produce tuples.
    - Without `kernel`, a system is plain JS on the main thread.
  - **`components` is optional.** A system without it runs once per run, on the main thread, and its body takes only the context.
  - **`input`** is an object schema of named fields for a per-run, read-only value, and `run` requires it exactly when it's declared.
    - A system with input can't use `added` or `changed`, because its `lastRun` is shared across runs that receive different input.
    - **A composite's input** has every field of its members' inputs, and each member receives the fields it declares, so workers get only those. A field several members declare is one value for all of them, with the same schema in each: a different type is a compile-time error at each member that differs, and `System.composite` throws naming both. A field optional in one and required in another is required.
    - `(system name, input)` is a replicable transaction. On a GPU, input maps to a uniform buffer.
    - A `Blob` input can only be stored or forwarded, because its contents can't be read synchronously.
  - **Bodies are `(subject, context)`:** `(row, context)` for a system with `components` and for a finalizer, `(context)` for a system without `components`, `(changes, context)` for a changes finalizer, and `(gpu, context)` for a render system.
    - `row`: `{ readonly entity }`, plus `read` values (read-only) and `write` values (readable and writable). No component may be named `entity`.
    - `context` holds each kind under the declaration's own key, present only when the declaration declares something of that kind: `resources` (values, assignable when in `write`), `lookup` (functions by name), `reduce` (contribution functions by resource) and `input`. It also has `commands`, except in GPU kernels and render systems. Keys of different kinds never share a namespace, so nothing can collide.
    - `commands`: `spawn` (returns a real `Entity`), `despawn`, `add` (adds or replaces, marking the component changed) and `remove`. They apply in the order they were issued. They take only components that aren't derived, which is checked in types and at runtime.
  - **Writes to the current row are direct and immediate.** Commands are only for structural changes and for writes to other entities.
  - **Names are global** and should be namespaced (`"physics/integrate"`). Ordering constraints list systems; a system can't list itself, since it doesn't exist while it's declared.
  - **Composites** flatten their members.
    - A composite's constraints apply to every member, and members' own constraints resolve against the flattened set.
    - If the same value appears twice it's flattened to one entry. Two different systems with the same name throw.
- **Scheduling:**
  - There's no built-in schedule. The app runs its main composite each frame (`world.run(main)`), and transactions or on-demand systems whenever it needs them.
  - Ordering comes from `before`/`after`/`during`, sorted into tiers. Systems in the same tier may run in parallel. A constraint that names a system outside the composite being run is ignored.
  - **`during` places a system alongside another:** after what that system follows and before what follows it, both by its own constraints and by others', outside a composite's own members. No-op systems ordered one after another are phases, and systems during different phases are ordered with each other. Where no ordering path separates them, the two share a tier.
  - **Unordered conflicts throw at `System.composite`:** within a composite, two systems that both write a component or resource, or where one reads what the other writes, must have an ordering path between them. Contributors to one reduced resource don't conflict with each other, and every system that reads it is ordered after all of them.
  - **A lookup can't read a component its own system writes;** that throws at registration. `up` can, since it reads a parent only after the parent ran.
  - **`up: { through, read }` runs rows in depth order** through `through`, a reference component, parent first, and the context's `up` holds what `read` lists of the row's parent, or null without one. A parent's value is the one written earlier in the same run, so one run carries a change down a whole tree, and results don't depend on chunking. It's Flecs's depth-ordered (`cascade`) iteration, with the parent's values in the context.
    - `through` doesn't narrow the match: rows without it are roots. References change only through commands, so the tree changes only at sync points.
    - A row's depth counts its ancestors among the matched rows: a row whose parent doesn't match is a root of this system's order.
    - With change filters, a row also passes when its parent reference, or what it reads of its parent, changed since the system last ran, decided on ticks, so a parent another system wrote counts too. Those components keep ticks and kernels keep their stamps. A row that moved to another archetype since then passes too, since removing its parent reference moves it, as do the children of a parent that moved to another archetype or started or stopped matching.
    - Rows on or under a parent cycle don't run. They'll be listed in the run report once it exists.
    - **Order:** rows run depth by depth, and within a depth in groups of one archetype whose parents share one archetype, each in storage order. Groups of a depth never read each other's writes, so values don't depend on the grouping; commands and reductions follow it, deterministically. The order, each row's parent row and the children of each parent change only at sync points, since only those move rows or change references.
    - **Kernels read `up` straight from the parent's columns:** a call covers one group, so it binds the parent archetype's columns once, and each row reads its parent's leaf at the parent's row. A leaf's stride and offset depend only on its component's layout, so they're the same in every archetype. `up === null` holds for the whole call.
    - **Filtered runs push changes down:** rows are marked from chunk ticks of their own filters and their parent reference, from the sync points' journal of entities whose parent, matching or archetype changed, and as children of parents whose read values changed; each row that runs marks its children, so a run costs a check of each chunk plus the subtrees that changed, and nothing when nothing did.
    - **`kernel: "gpu"` systems may declare `up`;** what `read` lists must be made of 4-byte scalars, as the rest of a GPU kernel's values are.
    - **In a main-thread body, `context.up` is one reused object,** valid only while its row runs, as `row` is.
- **World** (`src/world/`):
  - `World.create(resources?)` returns a world synchronously, with resources starting at the given values in place of their defaults; a key that isn't a resource throws. Built-in names are plain (`gpuDevice`), so they need no import there.
  - **Observing:** `world.observe.resource(name)` is an `Observe<T>`, `(notify) => stop`, the shape of `@adobe/data`'s without depending on it. It never notifies on subscribe; after each run that changed the resource it notifies once, with its value after the sync point, all of a run's notifications together before `run` resolves. A throwing observer is an `"observer"` failure in the run's report. Derived values are computed by systems, inside the ECS, so there are no operators on `Observe` values.
  - **Names are program-wide:** `System.create`, `System.render` and `System.composite` record the name, and a different system, rule or finalizer with it throws. One declared again the same, as a hot reload does, is accepted: a system is then a new one, and a finalizer keeps its place in every world with the new body. Constraints list the systems themselves, imported from their modules; when two modules import each other, one declares the order.
  - `run(system, ...input): Promise<void>` runs a system or composite and ends in a sync point.
    - It's async because workers can't be joined synchronously on the main thread.
    - **Registration is the first run:** the first time a world runs a system, it validates it with its members, adds their resources and loads their kernels, serialized with runs, and the run rejects without recording anything if that fails. A kernel's first run pays for its load; a run before timing work avoids it.
    - **`run()` resolves to a `World.Report`:** `failures` (each a `kind` of `"system"`, `"finalizer"` or `"gpu"`, the `name`, the `message`, and the engine's `stack` or null), the `skipped` systems of later tiers, and the count of `dropped` commands against entities that weren't alive. A throw's value is normalized to text, so the report is plain data; domain errors are data a system writes, not throws. It rejects only when the run can't happen or finish: registration fails, the world is disposed, its GPU device is lost, or its sync point can't apply a command's value.
    - Each system keeps its own `lastRun`, so it sees every change since it last ran.
  - `dispose()` and `[Symbol.asyncDispose]` wait for pending runs, then terminate workers and release memory, so `await using world = ...` works.
  - Read access from outside the schedule, on the main thread only:
    - `query`: `select` and `count`. They take `has`, plus options `not`, `where` and `order`.
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
- **Rules (structural derivation):** `Rule.create({ name, components: { has, not }, derive: [component] })`: entities matching its components have the derived components.
  - **Datalog with stratified negation** over which components each entity has. Rules and `within` declarations are evaluated as one fixed point per stratum; `Rule.create` rejects a cycle through a negation, which could oscillate, and any cycle through `within`. That makes the closure a pure function of the archetype, cached per archetype, so A→B becomes a single move A→closure(B), and entities never match and then unmatch within a flush. Reference cascades run first, on the values the plan leaves; they only despawn and remove, so the result is the same fixed point.
  - **Union ownership:** a derived component is present while any rule deriving it matches.
  - **Derived components** (`derived: true`) are structurally read-only to user code: commands reject them in types and at runtime; systems write their values. Each starts at its schema's `default`, which the types require, stamped `added`, and a normal `added` system fills it in. No initializer phase is needed, because creation can wait for the next system run and removal can't.
  - **Program-wide:** `Rule.create` checks the rule against every rule in the program, and throws there, so a world can't hold a rule set that fails. Each world starts using a rule at the first sync point after it has met every component in `has`; until then no entity can match it, so a world pays only for rules over components it uses. A rule created after entities match it, by a module imported later, applies at the next sync point.
- **Cascades** are component traits, expanded in Plan with the rules.
  - **`within: host`:** the component exists only while its host does, whatever removes the host; transitively; in command order, so removing a host and adding it back ends its dependents. A derived host a rule keeps never leaves. A dependent added without its host is dropped.
  - **`reference: "owner" | "weak"`** on an entity-valued component: when the target despawns, or a reference is written to an entity that won't be alive, `owner` despawns the holder and `weak` removes the component, transitively. Only the value the plan leaves counts, so a reference pointed elsewhere in the same sync point stays. References change only through commands (systems can't list them in `components.write`), which keeps the index of holders by target exact. Without `reference`, a reference dangles and a lookup of it returns null.
- **Finalizers are the only removal mechanism.** `Finalizer.create({ name, components: { read, has, not }, lookup, resources, before, after }, (row, { resources, lookup, commands }) => …)`. They run inside the sync point, on the main thread, against the final plan and live values from before Apply, with no copying. They are for releasing resources (GPU/DOM handles), updating indexes and adjusting aggregates, and they never miss a removal.
  - **A stop:** the entity matched before the sync point and is despawned, loses a required component by any cause (a command, a rule, `within` or a reference), has one removed and added again, or gains an excluded one. An entity spawned and despawned in the same sync point never matched.
  - **Deferred handling:** a consumer that handles removals later appends what it needs (IDs, values) to a queue it owns during Finalize, and works through it whenever it runs. A consumer that tracks stops keeps state about the entities it saw start, and ignores stops for entities it doesn't know.
  - **Run once, against the final plan.** Their structural commands go to the **next** sync point. Re-planning would let a later round bring back a component an earlier round already finalized, for example a freed handle on an entity that survives.
  - **Rows are read-only.** Resource writes take the sync point's tick, so each system sees them once. Finalizers have no change filters, so no `lastRun`.
  - **Lookups** see the state before Apply; entities spawned in the same sync point aren't alive yet.
  - **Never-initialized values:** they must accept these, such as a derived handle still at its default.
  - **Program-wide,** as rules are: `Finalizer.create` and `Finalizer.changes` validate and order it with every finalizer in the program, and each world starts using one once it has met every component it reads or has, or for a changes finalizer any it watches; one without them applies from the start. Its resources are added between runs.
  - **Order:** `before` and `after` list other finalizers, then creation order. Two that both write a resource, or where one reads what the other writes, must be ordered. Every active finalizer runs at every sync point; none is in a composite, and the phase costs nothing when none is active.
  - **Throwing:** the plan still applies, and the run's report lists each failure.
  - **`dispose()`** runs per-query finalizers for every live match, so handles are released, and no whole-plan finalizers.
- **Whole-plan finalizers** see the sync point's structural changes rather than one query's stops, for persistence, replication and structural undo: `Finalizer.changes({ name, watch }, (changes, context) => …)`. Changes are grouped by archetype pair (`from`, `to`, null for spawned or despawned, `added`, `removed`, `replaced`, `entities`), filtered to `watch`, every component that isn't derived by default; a derived one is rejected. `previous(entity, component)` and `next(entity, component)` give values before and after. They are ordered with per-query finalizers.
- **Async resources** need no other API: a rule derives a slot; a system with `added: [slot]` writes a fresh token into it and starts the load; the completion calls `world.run(apply, { entity, token, value })`, which adds the ready component (`within: slot`) if the slot's token still matches and releases the value otherwise; a finalizer on the slot aborts the load, and one on the ready component releases it. Shared assets are reference-counted by the loader, since the ECS gives each user exactly one acquire and one release.

- **Reductions** compute one value from many rows, in kernels across workers as well as on the main thread.
  - **The operator is a resource trait,** `[total]: { type: number; reduce: "+" }`, registered the same way: `"+" "*" "min" "max" "&" "|" "^"`, applied leaf by leaf to numbers, tuples and structs, and on booleans only bitwise. A contributing system repeats it, `reduce: { [total]: "+" }`; the types require the two to match and registration checks it again, so changing a resource's operator breaks every contributor.
  - **The body contributes** with `reduce[total](value)`; it can't read the fold, and a contributor can't read or filter on what it reduces into. A reduced resource is never written, by systems or finalizers.
  - **Each run starts again:** a run that includes a contributor sets the resource to the operator's identity, and it ends up holding the fold of every contribution in that run, stamped changed only if it differs. Several systems may contribute in one run; they don't conflict with each other, and every system that reads the resource is ordered after all of them. A run without a contributor leaves it as it is, and before the first, it holds its `default`.
  - **A failed or skipped run:** when a contributor fails, or no contributor runs its rows, the resource keeps its previous value.
  - **Change filters** are allowed: a contributor folds only the rows that pass.
  - **Partials:** each kernel call folds into its own f64 partial, one per claimed piece across workers, which the main thread combines in piece order once the system's chunks settle; within a call, WASM kernels fold each sum, product, minimum and maximum into four lanes in turn, combined in a fixed order. Results are deterministic for one world configuration; exact for min and max, for bitwise operators on 32-bit integers, and for sums and products of integers below 2^53, while other sums and products vary with worker count, as precision does across backends. A result rounds or wraps once when stored; an empty `min` or `max` of integers stores the type's own extreme.
  - **Contributions have a known shape:** a tuple or struct component contributed whole needs its leaves known, as whole-value writes do.

## Phase 0: open (affects API or correctness)

1. **Kernel subset.** Kernels compile to efficient JS or WASM. Main-thread systems run as normal JS with every feature available.
   - **Parser:** the bundler's own (`this.parse`, ESTree, in both Vite and Rolldown); the compiler validates the subset on that tree, and an ESLint rule can share the validator since ESLint also produces ESTree. A second JS parser would only add size and upkeep.
   - **Closed world:** every input comes from the ECS (query rows, resources).
   - **Precision:** arithmetic has at least the storage precision. Results are not bit-exact across backends (JS, WASM, GPU).
   - **Imported functions:** kernels call pure functions and use constants from any module the build resolves to a file, the kernel's own module included: user TypeScript or JavaScript, other packages' ESM, and the package's math types. The plugin reads each module a kernel reaches, with types stripped, follows its imports and re-exports, and inlines each call compiled in its own module's scope, so tuples are scalarized and never allocate, on JS, WASM and the GPU alike. A function outside the subset fails the build at the kernel's call, with a frame naming the file and line of each inlined function down to the failure. Recursion fails, also across modules. A module's constants must be known at build time: a `let`, or a mutation at runtime, isn't seen. Editing an inlined file compiles its kernels again, in dev too.
   - **Math types:** the package exports math types that are also namespaces of functions: `Vec2`, `Vec3`, `Vec4` (each `F32`, with `I32` and `U32` nested beside it), `Quat`, `Mat4x4`, and the scalars `F32`, `I32`, `U32`, each with a `schema`. They follow WGSL's semantics, and where WGSL leaves a result indeterminate they do what is fastest: integer vectors wrap, `round` rounds halfway values to even, `mod` is `x - m * floor(x / m)`, and `normalize` of a zero vector is NaN. Integer functions are defined for integers in range, and `pow` for a positive base; other inputs give indeterminate results, which may differ between the CPU and the GPU. The few that throw (`Mat4x4.inverse`, `Mat4x4.perspective`, `Mat4x4.lookAt`) can't be used in kernels.
   - **WGSL builtins:** a math function whose WGSL builtin matches it declares that explicitly, in its own file (`intrinsic({ wgsl: "normalize", parameters: ["vec3f"], result: "vec3f" }, implementation)`). In a GPU kernel a call to it becomes an intrinsic region holding its operands and its inlined body: WGSL emits the builtin on vector and matrix types, nesting calls as builtins do, and JS and WASM run the body, so CPU output is unchanged. Locals keep their JS names in WGSL, and a region's result is named after its function.
   - **Helpers return early:** a `return` inside an `if` splits the block, each branch running its own statements and then the rest, and the values merge as a conditional's do.
   - **Grammar:** `src/compiler/subset.md`.
   - **Value semantics** for tuple and struct locals, matching component values: locals are scalarized to one local per leaf.
2. **Non-local matching.** Per row, lookups with `has` and `not` and `up` already match on another entity, such as children whose parent has X. Still open: rules with one hop through a reference component, such as a child that has `visible` while its parent does, evaluated at Plan in depth order, with the index from targets to holders re-evaluating holders when a target's archetype changes. General relationship variables (`(ChildOf, $p)` where `$p` has X) aren't planned: they make matching depend on any entity's archetype, need a reverse index per variable, and break the closure cached per archetype.
3. **GPU systems.** Pure value reads and writes into component tables, with no structural commands, so the GPU never needs command buffer communication. Still open:
   - **Latency.** Whether a system can declare that its writes become visible to CPU readers only at a later sync point, so readback overlaps the next frame.

## Additive later (no breaking change)

- **Async ports:** a port can call `world.run(applyInput, data)`. Direct `world.commands` remains an option.

- **Systems as entities:** metadata on systems, plus a query that selects which systems to run.
- **WGSL helper functions, a minor readability option:** emit each inlined helper as its own WGSL `fn` instead of inlining it into the kernel, as a hand-written shader would. Parameter types come from the argument shapes at each call (a 3-tuple of numbers is `vec3f`, an object a generated `struct`), so a helper called with different shapes is emitted once per shape. GPU drivers inline small functions anyway, so it changes how the shader reads, not how it runs; JS and WASM stay inlined.
- **Reductions, later:** GPU kernels (a workgroup tree reduction to per-workgroup partials, which needs resources resident on the GPU); f64x2 SIMD accumulators across rows, beyond the four scalar lanes in place, deterministic since pieces are 16-row aligned; contributing a component value of unknown shape whole, as bounds over positions want; lexicographic `min` and `max` over a tuple, for argmin and argmax such as the nearest entity; and per-field operators.
- **Rules and finalizers, later:** derived entities (rules that spawn), `within` with several hosts, finalizers as kernels, value changes in whole-plan finalizers, why an entity stopped, relationship conditions, and the run's report listing dropped dependents.
- **Unregistering systems.** This needs a decision on what happens to a system's `lastRun` and artifacts.

## Phase 2+: performance

Measured with `pnpm perf` (benchmarks bundled as in production, on plain node) and `pnpm test:perf` (adds chromium with workers). vitest's node transform makes every imported binding a getter, so JS-heavy paths measure about twice as slow there.

### In place

- **Commands:** typed parallel arrays with explicit counts, reused per system across runs; ids resolved when issued. Kernels issue commands through `begin`/`value`/`component` by key index, allocating nothing. Workers post the same buffers back.
- **Sync point:** plans straight over the queued buffers into reusable typed arrays, through cached archetype edges (arrays by component id), an eight-shape spawn cache, and per-pair move lists; archetypes grow once per sync point; common layouts are written inline rather than through layout closures.
- **Chunk ticks:** every storage keeps the newest `added`/`changed` tick per 1024-row chunk, stamped with every row tick, so change filters skip unchanged chunks. Stamps every row reaches are made once per kernel call, per chunk.
- **Ticks only where observed:** a component has tick columns only once some registered system filters on its `added` or `changed`, and resources always do; until then nothing allocates or stamps them. Columns start at the current tick, so a new observer, starting with `lastRun = 0`, sees every row once. Kernels also drop `changed` stamps for components no system filters on with `changed`; registering an observer reloads the affected kernels.
- **Kernels where WASM can't compile** (a content security policy without `'wasm-unsafe-eval'`) run their compiled JS.
- **Change filters inside WASM kernels:** one call per archetype or worker chunk; chunks and rows are skipped in WASM. With SIMD, outside `up`, each aligned block of eight rows checks its ticks at once and is skipped when none passes.
- **Reductions in WASM kernels:** sums, products, minimums and maximums fold consecutive rows into four lanes in turn, so a fold doesn't wait on the one before.
- **Holders:** each reference component keeps the holders of each target as linked lists by entity index, updated from the plan's reference changes at Apply, so cascades find a despawned target's holders without a scan.
- **Lookups in WASM kernels:** a directory per lookup in shared memory (per archetype: a match flag and column addresses), rebuilt at sync points; finds check index and generation against the shared entity table.
- **Dispatch:** WASM chunks go through a per-worker task ring in shared memory, signalled with `Atomics.notify`; workers stay in that window across runs until a message must reach them.
- **Kernels:** interleaved layouts, SIMD within rows (SLP), across dense rows, and across rows of whole interleaved elements (four tight vec3 rows are three vectors), 16-byte loads for three-lane rows with column slack, exact integer `%`.
- **Main-thread reads:** `select`/`count` compile `where` once and resolve storages per archetype; single-component reads go straight to the storage, and `read.component` keeps the last component's id.
- **Main-thread spawns:** staged into a batch per component set and block-copied at the sync point. The plugin rewrites `commands.spawn({ ... })` with literal keys in main-thread systems into a per-site function with one parameter per value, writing each through a writer specialized to its column, so nothing is generated at runtime and nothing needs `'unsafe-eval'`. Other spawns read values by key.
- **Main-thread systems:** one accessor row per set of reads and writes, in fast properties, shared across systems and archetypes and rebound per pass; getters and setters specialized per layout; resource cells resolved once per run.
- **`up`:**
  - Kept current at sync points, as `up-order.md` describes. Sync points journal the entity indexes they spawn, despawn, move to another archetype, swap-move or write a reference for, while some `up` system reads the journal.
  - Each system keeps a tree by entity index (parent, level, children as linked lists), read from the journal; levels settle by walking up to a root or a settled entity, which also finds cycles.
  - The order: groups of one depth, archetype and parent archetype, as segments of one arena buffer with spare slots, patched in two phases by binary search and block moves within a group, so rows keep storage order.
  - Rebuilt in full, in O(rows), when the journal dropped entries a system hadn't read, or when more than a quarter of the order's rows would move.
  - Filtered runs mark entities into lists by depth, from chunk ticks and the journal; a depth with few marks is sorted, one with many is scanned in order.
  - WASM kernels run a group's row list, with the parent archetype's column addresses as parameters.
  - Workers take one depth at a time as claimed pieces, with a barrier per depth; depths too small to split run on the main thread without a wait.
  - The GPU runs a dispatch per group, in order, within one pass; row lists live in the heap and upload only when the order changes.
  - Main-thread bodies read parents through one reused accessor row.

### Next

- **U32 ticks,** if tick bandwidth matters for observed components. Halves tick memory and the change-filter scan's bandwidth, which bounds uniformly sparse filters. Comparisons use wrapping subtraction relative to the current tick, with a periodic clamp pass at a sync point, like Bevy's `check_change_ticks`, covering cell, `lastRun` and chunk ticks.
- **Compiled main-thread systems.** Accessor rows copy tuples out on every read and share one megamorphic body call site; compiling main-thread systems (or a JS-only kernel mode) would remove both. A per-system loop alone measured 5–10%.
- **Kernel fusion, once real workloads show fusable pipelines.** Consecutive per-row kernels over the same archetypes, each reading what the previous one wrote at the same row, become one pass. It cuts dispatch and memory passes: chain 6×1M spends its time streaming 12 MB six times. Fusion must keep each system's tick, `lastRun`, change filters and command order.
- **`up`:**
  - **Uploading only patched groups to the GPU,** once large GPU trees change structure every frame: the whole order uploads when it changes.
  - **Deep, narrow trees, not planned until a workload needs them.** They cost a barrier per depth on workers and about 4.5 µs per dispatch on the GPU. Workers could take whole subtrees each, with no barriers, and the GPU could use pointer jumping for associative compositions such as matrix products: log(depth) dispatches, each composing a row with its 2^k-th ancestor.
  - **Parent values copied into a dense column per group, not planned.** It would let kernels vectorize across rows, but the copy does the same scattered parent reads the kernel does, adds a pass and a barrier per depth, and costs rows × bytes read (64 MB for a mat4 over 1M rows). Wide fan-out already keeps a parent in cache, and heavy bodies such as mat4 products already vectorize within a row, so the estimated gain is under about 15% for compute-heavy bodies, and a loss for light ones.
- **WASM commands.** Encode kernel commands into a shared-memory buffer from WASM, so command-issuing kernels get WASM and the fast dispatch path. Measured at 18% on emit for a large change while the sync point dominates, so it waits for a faster sync point.
- **Per-archetype query-match bitsets.** Compute stop/start for each move as `match(from) & ~match(to)` in O(Q/32). Memory scales with archetypes, not archetype-graph edges.
- **Per-archetype rule-closure cache.**
- **Main-thread fast path.** Main-thread structural changes may skip the command buffer, or be applied early, only when no system or finalizer could observe the difference before the next sync point.
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
