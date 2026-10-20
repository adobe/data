# data-ecs follow-ups

Open items awaiting a decision or work. Remove an item once it's decided or done.

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

## Findings from the todo sample (`src/samples/todo/README.md`)

1. **A tick's observer failures can't be followed.** `amendReport` writes them into `report` without a new stamp, so
   `changed: [report]` never fires for them, and the next tick replaces that report before any pass reads it.
   Proposal: stamp the amendment, or add a failure channel systems can follow.
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

## Performance

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
