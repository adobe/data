# data-ecs follow-ups

Open items awaiting a decision or work. Remove an item once it's decided or done.

## Queued (decided, not started)

- **The todo sample creates its world through `World.create`,** the only external way to get one, never the
  implementation's `createWorld`; its `world` is typed `World`, with no test hooks.
- **An index lookup's `changed: true`:** a system runs only when the index's entries changed since it last ran, so
  `bindSummary` and `bindToggleAll` lose their early returns; then merge them into one system.
- **The entity an element shows:** a shared `attach(element, entity)` and `entityOf(event)`, keyed by a `unique symbol`
  read through `in` narrowing, `entityOf` searching the event's composed path; it replaces `todoOf` and its `WeakMap`
  and resolves finding 3 below.

## Decisions for the maintainers

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
- **Kernel lookup types:** they lack `has` and `not`, though the compiler accepts them.
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

## Findings from the todo sample (`src/samples/todo/README.md`)

2. **Observer systems can't declare `up`**, and `order` can't be combined with `up`, so views as separate entities
   don't work as bindings. Proposal: allow `up` in observer systems, since it only reads; let `order` take an index over
   the entity a reference names.
3. **No lookup from an element to its entity.** Object key parts are interned by structure (`index-keys.ts`), so every
   element is the same key. Proposal: identity-keyed object parts as a component trait, or document a `WeakMap` as the
   pattern.
4. **Low-cardinality hash indexes cost O(bucket) per change.** Buckets are kept in entity order and shifted on removal:
   one toggle costs 26, 62 and 400 µs at 1K, 10K and 100K. Proposal: unordered buckets with swap-remove and a position
   map, or a count-only index.
5. **Change filters scan the whole dirty chunk** (1,024 row ticks), once per system that filters on `changed`.
   Proposal: a second level of change ticks, one per 32–64 rows.
6. **Nothing awaits the next tick.** Tests watch `clock` with an observer system. Proposal: a test helper in
   `src/observe`.

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

- **A joined thread's first tail task once never finished,** under heavy machine load (two test suites at once): the
  world waited on `channel.idle()` with task 1 posted and not done (`threads.browser.test.ts`, tails "see one tick's
  values"). It didn't recur in 25 runs without the extra load, and the base failed once on another threads test in the
  same comparison. Worth a stress run of the joined-thread suites under load.

- **`transfer`, chromium:** its median varied with machine load. Check it alone on a quiet machine before the next
  record.
- **`joined observer 10K`:** checking archetype versions once per post instead of per row would save some of the
  thread's run (see perf.md "Next").

## Earlier open work

- Index step 5 items.
- Starting the pool for large index builds.
- `order` on workers.
- Typed transfers (Phase 7).
- The `Finalizer` namespace.
- Chromium timer clamps.
- The `transfer` cost.
- The perf.md "Next" items.
