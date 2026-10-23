# ecs follow-ups

Open items awaiting a decision or work. Remove an item once it's decided or done.

## Queued (decided, not started)


## Decisions for the maintainers

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
- **One-off reads:** `world.run` returns no value, so a one-off read needs an observer system that writes into an outer
  variable.
- **Per-row CPU values in render systems:** a render body's tables are `{ count, bind }`, so it can't draw with a
  per-row object such as a texture's bind group, and a row body can't learn its GPU row. A consumer drawing an image
  per row keeps its own instance buffer, 4,000 draws in 2.1 ms a tick. Possible: tables giving their entities in GPU
  row order. Not needed until a consumer's profile says so.
- **Descending sorted indexes:** an ordered render reads its index front to back, so a consumer painting back to front
  maps `instance_index` to `ecs_count() - 1u - instance_index`, which costs nothing. Possible: a `descending` option on
  sorted indexes. Not needed until a consumer's profile or readability says so.
- **Report retention:** the last 256 runs keep their reports (`retainedRuns` in `reports.ts`), a fixed internal
  constant; a later run takes the oldest one's entity. Recommended: keep it internal until a consumer needs another; then
  a world option or resource.
- **The cost of a report for every run:** a clean run costs about 125 ns more in node (`run idle` 333 to 458 ns, `run
  observer` 166 to 291), half of it the two clock reads `elapsed` takes. Decided: timing stays on. Check again if runs
  get cheap enough for it to matter: a `Report.timing` resource, off by default with `elapsed` NaN, measured `run idle`
  416 ns and `run observer` 208.
- **Reports are hidden from queries that require no component,** as the resource entity is: an index or system with no
  `has` or `read`, and changes finalizers watching everything, don't see them. Recommended: accept, since they're the
  world's own.
- **Report components are writable:** systems may write or despawn reports, which are ordinary entities; a despawned
  one is spawned again for a later run. Recommended: accept, as with any entity; or make them world-written as `clock`
  is.
- **Errors while tails run:** an add or removal of `Report.errors` found after a run's sync point waits for the next
  sync point while tails run on a joined thread, an earlier run's errors emptied meanwhile. Recommended: accept; errors
  known before the sync point, system failures, skipped systems and warnings, are in place when the run resolves.
- **A joined thread's own observer runs:** what such a run's body throws reaches the world for its next report rather
  than the run's, and a `run` of several of its own observer systems resolves to the last one's number. Recommended:
  accept.
- **The factories' own failures** are rethrown out of band from the reports their runs see, a pass's failures once a
  later run of theirs sees the next report; on a joined thread they're only in the world's reports. Recommended:
  accept, since the factories are for tests and debugging.
- **An observer pass's failures are in the next run's report,** not their own run's, so each report's errors are
  written once; nothing reports them until another run or tick. Decided.
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

## Findings from the todo sample (`src/samples/todo/README.md`)

2. **Observer systems can't declare `up`**, and `order` can't be combined with `up`, so views as separate entities
   don't work as bindings. Proposal: allow `up` in observer systems, since it only reads; let `order` take an index over
   the entity a reference names.
4. **Low-cardinality hash indexes cost O(bucket) per change.** Buckets are kept in entity order and shifted on removal:
   one toggle costs 26, 62 and 400 µs at 1K, 10K and 100K. Proposal: unordered buckets with swap-remove and a position
   map, or a count-only index.
5. **Change filters scan the whole dirty chunk** (1,024 row ticks), once per system that filters on `changed`.
   Proposal: a second level of change ticks, one per 32–64 rows.
6. **Nothing awaits the next tick.** Tests watch `clock` with an observer system. Proposal: a test helper in
   `src/observe`.

## Findings from strings in shared memory

- **A joined finalizer read a resource of its thread as undefined:** in `remote-finalizers.test.ts`, "that throw are in
  a later run's report", the finalizer's `resources[tone]`, an object of its thread, is undefined for the stops of a
  sync point soon after the thread joined, where the same finalizer reads it in the other cases; the fixture reads it
  optionally now. The test checks no tone, so whether it was undefined before, as a string, wasn't seen. Worth finding
  out whether a remote finalizer can run before its thread's resources reach its mirror.

## Features to discuss

- **Computed index keys:** an index keyed on a value computed from a component, such as a struct field
  (`position.x`, `Report.run.number`), instead of only whole components. Two possible forms:
  `key: [[Report.run, "number"]]` (a field path) or `keyOf: run => run.number` (a function). Open questions:
  - how key words are laid out in shared memory;
  - lookups on workers, on joined threads and in kernels (JS and WASM);
  - change tracking that follows the field, not the whole component;
  - whether a function form can run anywhere but the world's thread.
- **Discriminated struct unions:** unions of structs with a number, boolean or string-literal discriminant, stored in
  fixed size (a tag column plus the variants' fields) so they live in shared memory. Today `isStruct`
  (`interface/registry/schemas.ts`) treats every `anyOf` as an object. The work covers row readers and writers,
  narrowing on the tag in the kernel compiler, WGSL layouts, and snapshots. Check first whether the type-level
  `IsStruct` already calls numeric-tagged unions structs while the runtime doesn't.

## Performance

- **The filtered `up` benchmarks are slower than this machine's record at `e3c30aa1`:** `up one root changed` +49%,
  `up filtered after a reparent` +45%, `up small tree in a big world` +79%. They're the same at `c6bb3c83`, before
  strings, so the drift is older. Worth bisecting from `e3c30aa1`.

- **A joined thread's first tail task once never finished,** under heavy machine load (two test suites at once): the
  world waited on `channel.idle()` with task 1 posted and not done (`threads.browser.test.ts`, tails "see one tick's
  values"). It didn't recur in 25 runs without the extra load, and the base failed once on another threads test in the
  same comparison. Worth a stress run of the joined-thread suites under load.

- **`transfer`, chromium:** its median varied with machine load. Check it alone on a quiet machine before the next
  record.
- **`joined observer 10K`:** checking archetype versions once per post instead of per row would save some of the
  thread's run (see perf.md "Next").
- **`loop tick add remove` fails its leak check:** the world holds 3 schedules and 38,080 arena bytes after, against 4
  and 16,192 before, so `pnpm perf` stops there. It fails the same before the change to input types.

## Earlier open work

- Index step 5 items.
- Starting the pool for large index builds.
- `order` on workers.
- The `Finalizer` namespace.
- Chromium timer clamps.
- The `transfer` cost.
- The perf.md "Next" items.
