# Keeping the `up` order current

Plan for keeping `up`'s order current across sync points, rather than rebuilding it after each structural change that touches it. Referenced from `design.md` (Phase 2+, Next).

## Goal

| Common operation | Today | Target |
|---|---|---|
| Few values change, no structural change (filtered run) | O(changed) | O(changed) |
| Few values change, plus spawns or despawns that frame | O(rows) | O(changed + spawned) |
| Every row recomputed each frame | kernel-bound | kernel-bound |
| Spawn k children | O(rows) rebuild | O(k) |
| Despawn k leaves, in any archetype | O(rows) rebuild | O(k) plus a block move within a group |
| Reparent a subtree | O(rows) rebuild | O(depth + subtree) |
| Load a big tree in one batch | O(rows) rebuild | O(rows), with a cheaper rebuild |
| A small tree in a big world | O(entities in the world) | O(tree) |

Rows stay in storage order within each group, so the contract ("each in storage order", deterministic commands and reductions) is unchanged, and the full rebuild is an exact oracle for tests.

## Steps

Each step is measured against the baseline in `perf/` before the next starts.

1. **A cheaper rebuild with finer triggers.**
   - No passes sized by every entity in the world: the child lists and placement are sized by matched rows.
   - The remaining passes fused.
   - Depths kept while the tree is unchanged: no write to `through`, no target despawned, and no node with children starting or stopping matching. A rebuild then only places rows.
2. **The sync point's journal of what it spawned and moved,** per archetype, by entity index. Filtered runs mark those rows from it and keep pushing changes down, instead of checking every row whenever a matched archetype's rows changed.
3. **One child list per `through` component,** shared by every `up` system through it: `firstChild`, `next` and `previous` as Int32 arrays by entity index, linked and unlinked in O(1) without allocating. It's fed from the reference writes the sync point already records and from born rows, so it covers `through` components without a `reference` policy, and it lists every holder, matched or not.
4. **Groups as segments of one buffer,** each a start, length and capacity, with per-archetype side arrays (depth and slot by row, swapped alongside the archetype's columns) instead of positions among all matched rows.
   - A group that outgrows its capacity moves to the end of the buffer; a rebuild compacts it.
   - The GPU keeps one buffer and uploads the dirty ranges in one submit.
   - Pushed runs sort marks by (group rank, position), with groups ranked by (depth, archetype, parent archetype).
5. **Patches in two phases at the sync point.**
   - While commands apply, record only what was touched: plan entries, rows `swapRemove` moved, and born ranges.
   - After the plan's references are final, resolve rows from the entity table and the tree from final `through` values, walking up over the touched entities parents first, with a memo.
   - One event, "effective parent changed", covers a `through` write, a parent's despawn, and a parent starting or stopping matching or having what `up` reads. Its subtree is renumbered through the child list.
   - A spawn appends at the end of its group: its row is the highest in its archetype, so storage order holds.
   - A swap-remove deletes the hole's slot and moves the last row's slot into the hole's place, by binary search and a block move within the group.
   - Parents are listed by entity index and resolved to rows once per run, by a gather over the groups whose parent archetype's rows changed, so a swap-moved parent with many children costs one pass, not a patch per child.
   - Each system keeps the set of entities on or under a cycle. A touched entity in it is walked again, so cycles break as well as form.
   - Per-entity state is cleared when an entity index is released.
6. **The full rebuild stays** as the fallback, and as the oracle: a property test applies random spawns, despawns, reparents, matching changes and cycles, and compares the kept order with a rebuilt one exactly.

## Cost

- **Memory:** per `through`, 12 bytes per entity index for the child list. Per `up` system, depth and slot per matched row in per-archetype side arrays, and 8 bytes per row of row and parent lists, with slack per group.
- **Sync point:** O(touched entities + subtrees renumbered), plus block moves bounded by one group each.
- **Run:** a parent-row gather over groups whose parent archetype changed.

## Not planned

- **Rows drifting out of storage order:** it would remove the block moves but change the contract, and the block moves are cheap.
- **Depth in the archetype,** as Flecs's cascade does: it splits tables, and archetype ids are positional.
