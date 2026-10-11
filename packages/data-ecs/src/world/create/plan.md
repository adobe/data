# World.create implementation plan

All of the runtime lives here. The only export is `create`, which moves here from `world/create.ts`. Rules:

- No dependency on `@adobe/data`. Its code can be read for reference: `typed-buffer/`, `cache/memory-allocator.ts`, `ecs/store/core/`, and `ecs/database/calculate-system-order.ts`.
- Performance comes first, then code size.
- Kernels are compiled from the start. The compiler and Vite plugin run at build time, so they live outside this folder under `src/compiler/`, with their own package entry. Generated code reaches the runtime through one internal hook, `attachKernel(system, url)`.
- Every module gets unit tests. The particle sample becomes a real end-to-end test.

## 1.1 Main thread

1. **Memory.** A shared `WebAssembly.Memory` from the start, so 1.2 and 1.3 don't change how data is stored.
   - Columns are typed-array views into an arena allocator.
   - Memory grows only at sync points, and views are refreshed afterwards.
2. **Storage.**
   - Archetypes are tables keyed by component set.
   - Each linear component is a column in the arena. Each non-linear component is a JS array.
   - The entity table maps each index to its archetype, row and generation. The free list holds a freed index back until the next flush.
   - Each row stores `added` and `changed` ticks per component, as f64 so they never wrap. U32 ticks come in phase 2.
3. **Registration.**
   - Flatten composites.
   - Check for duplicate system names and for missing schemas.
   - Check unordered conflicts, including a lookup that reads a component its own system writes.
   - Sort into tiers from `before`/`after`/`during`.
   - Build each system's archetype matches lazily, and extend them as archetypes are created.
4. **Running.**
   - Run tiers in order.
   - Change filters compare against each system's `lastRun`.
   - Non-kernel systems get accessor rows: `defineProperty` getters and setters for the declared keys, with copy-on-read and whole-value writes. Values are immutable, so a copy is never edited.
   - Resource-only systems run once per run.
   - A system that throws rejects `run`.
5. **Commands and sync points.**
   - Each system has its own buffer, merged in tier order.
   - Plan: compute each entity's net move from one archetype to another, and skip it when nothing is pending.
   - Apply: swap-remove, insert spawned rows, then free indexes.
   - `spawn` reserves a real entity through the atomic cursor.
6. **Reads.**
   - `query.select` and `count`, with `not`, `where` and `order`.
   - `read.entity`, `read.component` and `read.resource`.
   - Resources are stored as components on a single entity, with their initial values taken from the schema `default`.
7. **Compiler** (`src/compiler/`):
   - The bundler's parser (`this.parse`), plus a validator for the kernel subset.
   - Maps each component, resource and lookup access to its slot by binding.
   - Emits a JS kernel `(columns, start, end, resources, lookups, keys, args, commands, tick)` that records the shapes it assumed (`world/create/kernel.ts`). The runtime applies change filters and passes only passing row ranges. Kernel code references no module bindings, so it can move to a worker chunk.
   - Registration checks those shapes against the schemas.
   - In 1.1, kernels run on the main thread.
8. **`dispose`,** and the particle sample as an end-to-end test.

## 1.2 Workers

- **Pool:** sized from `navigator.hardwareConcurrency` minus the main thread, and only with shared memory. The worker entry script (`worker.ts`) lives in this folder. Without cross-origin isolation, arrays use plain `ArrayBuffer`s and everything runs on the main thread, since growing unshared memory would detach every view.
- **Kernel modules:** the plugin emits each kernel's `create` as its own module, an emitted chunk in builds and a virtual module in dev. The description carries its `url`, and the main thread and every worker `import()` it.
- **Registration:**
  - Post the shared `Memory` to each worker once.
  - Each worker imports the kernel URLs and keeps the kernels by index, along with their column sources, lookups and keys as component ids.
  - Registration resolves once every worker has finished loading.
- **Shared state:**
  - The spawn cursor and free list live in shared memory, and `reserve` is atomic, so workers spawn real entities.
  - After each sync point, workers receive what changed in the layout: new schemas, new or grown archetypes, and the entity table. Messages are ordered, so a worker always has the layout before the tasks that use it. Shared memory doesn't detach as it grows, so nothing else is reposted.
- **Dispatch:**
  - Within a tier, kernels start first: an archetype of at least `minimumChunk` rows is split evenly across workers, and smaller ones run on the main thread. Then non-kernel systems run on the main thread while the workers work.
  - Each worker applies the change filter to its own chunk.
  - Each system has its own command buffer per run. A worker returns its chunk's commands with its reply, naming components by id. Buffers merge in (tier order, chunk order), so results don't depend on timing. Encoding commands into shared memory is phase 2.
  - A failing system or chunk rejects the run after its tier finishes. Later tiers are skipped, and the commands so far still apply.
- **Tests:** a world with zero workers and with three gives identical results, including commands and lookups issued from workers (`workers.browser.test.ts`, chromium). `dispose` terminates every worker.

## 1.3 WASM

- **The compiler emits an IR** alongside the JS kernel.
- **Registration generates WASM** from the IR, using the precision in the schemas. It compiles each module once and posts it to every worker, where it is instantiated against the shared `Memory`.
- **Tests** require JS and WASM kernels to give the same results, within storage precision.

## Deferred

Builtins, finalizers, rules, the ESLint rule, SIMD, and GPU.
