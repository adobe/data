# ecs follow-ups

Open items awaiting a decision or work, by priority: the API is the focus while it's being finalized; then
correctness, then optimization. Remove an item once it's decided or done.

## API changes

- **Instrumentation:** a later `World.create` options parameter may take instrumentation: timing, failure logs,
  debugging, and what no failure says, a tier that waited for a joined thread and commands that did nothing, which the
  implementation gathers only for its tests (`recorderOf`). Nothing until it's designed.
- **Optional components in GPU kernels:** each dispatch's record could carry a presence word, but WGSL has no
  `undefined` to read where an archetype lacks one, and a GPU kernel can't fail its system for one row; supporting
  them means a presence expression through the WASM and WGSL backends and a GPU semantics for absent reads and writes.
- **Optional groups:** components always present together (in one consumer, a text's four and a path's three) must
  each be tested for `undefined` before building one object. Possible: an optional group, present or absent as a
  whole, narrowed by one test. No consumer is asking for it; record usage before deciding.
- **Iterable lists:** `for (const row of list)` on index lookups' lists, binding each row as the loop reaches it with
  no allocation (the list is its own iterator, reset per loop), lowered by kernels to the indexed loop. `list[i]` and
  array methods stay out: indexing can't bind lazily without a Proxy, and the methods would widen the surface.
- **`watch` by trait on changes finalizers:** `Finalizer.changes({ watch: "persist" }, …)`, `watch` taking a trait name as
  well as a list of keys, typed as `Component.With<…>`, computed once per component id as `watches` already is. The
  hook external persistence would build on.
- **Observer systems can't declare `up`**, and `order` can't be combined with `up`, so views as separate entities
   don't work as bindings. Proposal: allow `up` in observer systems, since it only reads; let `order` take an index over
   the entity a reference names. (from the todo sample)
- **Per-row CPU values in render systems:** a render body's tables are `{ count, bind }`, so it can't draw with a
  per-row object such as a texture's bind group, and a row body can't learn its GPU row. A consumer drawing an image
  per row keeps its own instance buffer, 4,000 draws in 2.1 ms a tick. Possible: tables giving their entities in GPU
  row order. A mesh and material package on `@adobe/ecs-gpu` will need it: a draw per material binds that material's
  textures.
- **Frames in flight:** `run` resolves once its work is submitted, before the GPU finishes it, so a loop on a slow GPU
  queues frames without bound; the particles sample caps them at two with `onSubmittedWorkDone`. Possible: the world's
  loop skips a beat while a set number of submitted frames are unfinished, the number a resource.
- **A resource holding objects that aren't data can't start as an empty map:** a `ReadonlyMap` of `GPUTexture`s, say,
  gets no fresh map, and a namespace's `default` holding an empty one fails the build's deep readonly check at the
  objects. Such a resource allows `null` instead, which `@adobe/ecs-gpu`'s `states` resources do, and every reader
  handles it. Possible: a fresh empty `ReadonlyMap` or `ReadonlySet` for one of objects too, since emptiness doesn't
  depend on what it would hold.
- **Pipelines built from a device a body captured go stale** when `gpuDevice` changes: the world rebuilds its own GPU
  objects, and a consumer's must follow `changed: [gpuDevice]`. `System.render`'s and `gpuDevice`'s docs should say so.
- **Descending sorted indexes:** an ordered render reads its index front to back, so a consumer painting back to front
  maps `instance_index` to `ecs_count() - 1u - instance_index`, which costs nothing. Possible: a `descending` option on
  sorted indexes. Not needed until a consumer's profile or readability says so.
- **Computed index keys:** an index keyed on a value computed from a component, such as a struct field
  (`position.x`), instead of only whole components. Two possible forms: `key: [[position, "x"]]` (a field path) or
  `keyOf: value => value.x` (a function). Open questions:
  - how key words are laid out in shared memory;
  - lookups on workers, on joined threads and in kernels (JS and WASM);
  - change tracking that follows the field, not the whole component;
  - whether a function form can run anywhere but the world's thread.
- **Discriminated struct unions:** unions of structs with a number, boolean or string-literal discriminant, stored in
  fixed size (a tag column plus the variants' fields) so they live in shared memory. Today `isStruct`
  (`interface/registry/schemas.ts`) treats every `anyOf` as an object. The work covers row readers and writers,
  narrowing on the tag in the kernel compiler, WGSL layouts, and snapshots. Check first whether the type-level
  `IsStruct` already calls numeric-tagged unions structs while the runtime doesn't.
- **`where` inferred from an early return:** a row body starting `if (row[cell] … ) return;` over shared values could
  give the build a `where` of its own, so the system skips archetypes without one being declared.
- **Predicates over several shared values together:** `where` takes a predicate per shared component; one taking an
  archetype's values of several, `(values, context) => …`, would express conditions across them, as a cell and a level
  of detail together.
- **`where` on render systems:** a render system's tables could be culled by its shared values, as a frustum culls
  chunks; render declarations take no `where` yet.
- **Shared components as index key parts:** an index could key by an archetype's value per row; filtering by shared
  values is `where`'s for now.
- **The `Finalizer` namespace** (from earlier open work; to be restated before it's discussed).

## Correctness

- **The guide sometimes runs a chapter it's leaving once more.** On CI's runners, about one run in three, going from
  Resources back to Systems framed Resources' run again before Systems' new one (`app.page.test.ts`, "runs a chapter
  shown again once"); it doesn't reproduce locally, even with the page throttled 12 times. The frame is replaced only
  when the shown chapter's `page` changes, and only the address chooses the chapter, so a compile's reply landing
  mid-switch (`receiveCompiled` checks the revision, not whether the chapter is shown) is the likeliest path. The test
  records each frame's address, hash, status and time when it fails. It's skipped on CI until it's hardened; enable it
  there again once it passes reliably.
- **The guide's build-problem test races TypeScript's problem** (`app.page.test.ts`, "shows what the ECS build
  rejects"): it compares the Problems badge's count with the list's as soon as the build's rejection shows, and
  TypeScript's own problem for the same `async` body can land between the two reads (CI: badge 1, list 2). Wait for
  both problems before comparing. Skipped on CI until then.
- **Transactions, future:** never by default, since they would cost every run. An explicit declarative option on a
  one-off system, making its run all or nothing.

- **Describing systems** (`compiler/describe.ts`, for the guide) lays out only the keys its module declares: a kernel
  reading a key of another module, or looking up through an index, whose key layout the world builds, gets its WASM
  and WGSL only at registration, and a system's thread comes only from its module's declarations. Reading them through
  the build's type converter would close both.

## Optimization

- **f64 SIMD for `Vec3` bodies:** automatic kernels' f64x2 lanes run only across dense single-f32 columns, so a body
  over `Vec3` components, as chapter 14's `move`, runs in WASM a row at a time. Measure lanes within a row's leaves.
- Index step 5 items.
- Starting the pool for large index builds.
- `order` on workers.
- Chromium timer clamps.
- The `transfer` cost: compare its changes by `transfer small bitmaps`, since moving large bitmaps varies twofold
  in the browser.
- The perf.md "Next" items.

## External utilities

- **Persistence,** never part of the core: provided externally through custom traits (e.g. `persist: string`, the stable
  name saved data maps through, independent of thread ids) and changes finalizers watching by trait.
- **A test helper awaiting the next tick.** Tests watch `clock` with an observer system today; a helper in
  `src/observe` would do it (from the todo sample).

## Publishing as adobe/ecs

Once this repository is public as `adobe/ecs`:

- **Pages:** GitHub serves an Adobe repository's site at `adobe.github.io/ecs/`, which redirects to
  `opensource.adobe.com/ecs/`. That domain is Adobe's own CDN, which forwards only the project paths on its allowlist
  to GitHub Pages and answers 404 itself for the rest (`server: Varnish`; over `http://` it redirects to
  `developer.adobe.com/open/…`). Ask Adobe's Open Source Office (Grp-opensourceoffice@adobe.com) to route `/ecs/` as
  it routes `/spectrum-web-components/`. To check a deploy before that's done, ask a GitHub Pages server directly:
  `curl -sk --resolve opensource.adobe.com:443:185.199.108.153 https://opensource.adobe.com/ecs/`.
- **The deploy workflow** runs once the repository is public: enable Pages with GitHub Actions as its source.
- **Site paths:** packages publish to `ecs/` and `ecs/samples/` so adobe/data's copy can share its site; on this
  repository's own site they become `/ecs/ecs/`. Once adobe/data no longer hosts the copy, publish the API reference
  and the samples at the site's own paths and update the root README's relative links.
- **Links:** `packages/ecs/README.md` links the guide and API reference at `opensource.adobe.com/data/ecs/`; point them
  at this repository's site.
- **adobe/data's copy:** remove `ecs/` and its workspace entries and overrides there, and stop syncing.
- **CI:** hosted runners work once public; tests needing a GPU skip there (`CI` set), so a local run still covers them.
- **npm:** publish `@adobe/ecs` from here, `private` and versions as they are.

## Decisions awaiting confirmation

- **An index lookup's `changed: true` is a change filter,** as a resource in `changed` is: when the index changed every
  row passes, and otherwise rows pass by the system's other change filters, so with `components.changed` it runs the
  rows that changed even while the index didn't. Only a system whose change filters are all such indexes, with no
  `up`, is skipped before its body, keeping its `lastRun`. The alternative, a condition, would run no row while the
  index is unchanged, whatever else changed. Recommended: accept.

- **Re-adding an observer system:** a re-added observer system runs from the next pass, even for a run already queued,
  while a first add waits for registration. Recommended: accept.
- **Indexes without ids on joined threads:** these now work instead of throwing; the documentation only required ids on
  keys. Recommended: accept.
- **Factories after dispose:** the factories give no first value. Recommended: accept.
- **Factory failure labels are numbered.** Recommended: accept.
- **Factory read gaps:**
  - a cold resource read costs 0.875 µs against 0.54–0.58 µs before;
  - "1K entities, one changed" costs 29.7 µs against 25.8 µs.

  Recommended: accept both, since single-entity observing is for debugging.
- **The cadence benchmarks report the mean of the middle half of ticks** rather than the median, because chromium's
  timer steps are about one tick long.
- **Filtering in the todo sample:** it writes `hidden` on each row (about 2 ms of script at 10K) rather than setting one
  attribute on the list and hiding rows with CSS. The attribute version is slower once laid out (25 ms against 17 ms
  at 10K) and puts the filter's meaning in the list element.
- **Out of band is `reportError`, or an uncaught exception:** browsers and their workers log and dispatch it as an
  `error` event a page can handle; node has no `reportError`, so a thread there crashes unless it handles
  `uncaughtException`, as for any uncaught error. A joined node worker's failures are reported on the world's thread,
  so they don't end the worker. Recommended: accept.
- **Reported again after recovering:** a system is reported once while it keeps failing, and again once a tick or pass
  ran its body without its failing, conditions and change filters skipping it changing nothing; a finalizer once a
  tick's sync points ran it without its failing; an index once a tick found no conflict in it; GPU work once a run of
  its system gave its scopes no error. Joined threads tell the world only of
  failures, so their observer systems are reported once per placement and their finalizers once. Recommended: accept.
- **What's no failure and isn't public:** commands that did nothing and tiers that waited for a joined thread are
  gathered only for the implementation's tests. Recommended: accept, until instrumentation is designed.
- **What fails a run and what's out of band:** a run rejects for its systems and finalizers, its tails, its joined
  threads gone, its unique indexes' conflicts, those its observer pass found included, and its own observer systems,
  those on joined threads included; what those added throw, GPU errors, which
  come after the run, and kernels failing to load on the pool after it are out of band. A joined thread's `run` of its
  own observer system rejects with what it threw there, its own `Error`, and a `run` of several of them resolves to
  nothing. Recommended: accept.
- **The rejection's shape:** one failure's `Error`, `System "label" (id) failed: message` with what was thrown as its
  `cause`; several, an `AggregateError` of them; systems skipped after a failed tier named in the message. A joined
  thread gets only the message. No contract. Recommended: accept.
- **A `share` that fails is an unhandled rejection when nothing handles it,** as a run's is: a refused claim, a dispose
  while the thread joins, a port shared again while its thread lives, or that thread gone first, one leaving on the
  turn its join resolved included. Recommended: accept.
- **`share` covers observer systems added before awaiting anything else after `join`:** the joined thread says it's
  ready on its next turn of the event loop. One added after an import or a fetch reaches the runs after its add arrived;
  an idle rule covering those would wait an unbounded number of turns. Recommended: accept, as documented.
- **A node `MessagePort` already closed** is told by `hasRef()` false once a message listener is set, since its
  `close` came before any listener: a port a consumer `unref`'d before sharing or joining through it would read as
  closed. Recommended: accept.
- **Recovery of a reported row system** needs its body to have run on a row: worked out when a reported system's
  recovery is checked, from what its change filters pass since its last run's tick, so a write later in the same tick
  to a row it filters on counts as passed. Recommended: accept; exact counting would cost each run.
- **An unawaited failing run is an unhandled rejection,** whatever follows it: the queue chains a promise of its own,
  which never handles the one `run` returned, at about 40 ns a run against chaining on it (`run idle` +42 ns, perf.md). Recommended:
  accept.
- **A body returns no promise** (decided by the coordinator): a `PromiseLike` return type, or one declared exactly
  `unknown` or `object`, which may hide one, is a type error in `System.create` and `System.render`; at runtime a
  thenable a per-run, row or render body returned fails its system at once, never awaited, so no body holds the
  world's runs. Types can't tell a body returning `any`, a body typed `any`, nor an async function typed as returning
  `void`; the runtime check covers those. The build refuses `async` row bodies.
- **A world's run of its observer system on a joined thread** waits for it to run there, resolving to its value as
  structured clone, or rejecting with what it threw there, which isn't reported out of band; a value that can't be
  posted fails it. A post owed to it that the thread gives back while the run waits is posted again at once.
  Recommended: accept.
- **Only the value a run resolves to is kept or posted:** composites' and ticks' members return values that are never
  held, cloned or posted, unpostable ones included. Recommended: accept.
- **Nothing is reported once a world is disposed,** that is once its dispose ran, after the runs queued before it, which report what failed in them; GPU errors and a tick's tails settling after it included; and
  ticks running while a joined thread leaves report its systems' `"thread"` failures, once each. Recommended: accept.
- **The factories' own runs** rethrow their rejections out of band; what their systems added to the world throw the
  world reports itself, labeled by the factory's shape. Recommended: accept, since the factories are for tests and
  debugging.
- **Strings live in shared memory and have no thread:** any string, a union of string literals, and either with
  `null`, which is handle 0. A `thread` on one is rejected in types and at registration. Recommended: accept.
- **Records only while a thread may read them:** the world's thread holds string values as objects, and keeps records
  from the first `share` until the last thread is gone, so a world with no joined thread pays nothing for them (`string
  read 10K` 2.78 ns a row, as `object read 10K`; `string write 10K` 19.5 ns against 21). Recommended: accept.
- **Writing strings with a joined thread costs a record each:** `string write 10K joined` 127 ns a row, most of it
  flattening the new string to copy its code units; `TextEncoder.encodeInto` and copies through scratch measured the
  same. Recommended: accept; revisit with writes encoded lazily, at the next point a joined thread could read them.
- **Only the world's thread writes strings:** a system placed on a joined thread that writes one is rejected, and a
  command there gives one only its start. Recommended: accept for now; a joined thread's writes would need records
  allocated there, through the arena's top in shared memory.
- **Kernels don't read strings yet,** by type and check, and **an index keyed by strings is looked up only on the
  world's thread,** which keeps it by values. Recommended: accept for now; kernels would need the records' code units
  compared in the compiler, and joined lookups an index of interned records.
- **An observer system on a joined thread that reads a string resource doesn't post copies of its resources:** nothing
  waits for such posts, and a handle there could outlive its record, so it posts as row systems do. Recommended: accept.

