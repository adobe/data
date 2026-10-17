# Keeping the `up` order current

How `up` keeps each system's tree and order current across sync points, patching what changed rather than rebuilding. Referenced from `design.md` (Phase 2+, In place).

## Cost

| Common operation | Cost |
|---|---|
| Few values change, no structural change (filtered run) | O(chunks checked + changed) |
| Few values change, plus spawns or despawns that frame | O(changed + journaled), plus block moves within groups |
| Every row recomputed each frame | kernel-bound |
| Spawn k children | O(k + depth) |
| Despawn k leaves, in any archetype | O(k), plus a block move within a group per removal |
| Reparent a subtree | O(depth + subtree), plus block moves within groups |
| Load a big tree in one batch | O(rows), building the order in full |
| A small tree in a big world | O(changes to the tree); a full build clears arrays sized by every entity index |

Rows stay in storage order within each group, so the contract ("each in storage order", deterministic commands and reductions) holds whether the order was patched or built in full. A property test applies random spawns, despawns, reparents, matching changes and cycles, and checks full and filtered runs against values computed from reads.

## Mechanisms

- **The journal** (`journal.ts`): sync points append the entity index of each plan entry that despawns or changes archetype, each row `swapRemove` moved, each holder written a reference, and each born row, while some `up` system reads it. Each system keeps its own position. The journal keeps at most the entity count of entries, at least 4096; past that it drops them, and a system behind builds again from every row, which costs about what reading them would.
- **The tree, per `up` system** (`up.ts`), by entity index: each matched entity's parent, its level (depth + 1, 0 when unmatched, -1 on or under a parent cycle), and its children as linked lists, linked and unlinked in O(1).
  - `update` reads the journal once per entity index: an entity that stops matching is unlinked and its children become roots; one that starts matching, changes parent or moves to another archetype is settled again.
  - `settle` walks each pending entity up to a root or to an entity already settled in that call, so every level it sets is exact and a walk that meets itself finds a cycle; then it descends to children whose level changed. Cycles break as well as form, since a journaled entity is walked again.
  - `archetypeAt` keeps each entity's archetype as the tree last saw it, so a row that only swap-moved isn't settled again.
- **The order, as segments of one buffer** (`order.ts`): groups of one depth, archetype and parent archetype, run in that order, each a start, length and capacity in one arena buffer of rows, parent rows and entity indexes, with spare slots: an eighth of its rows, at least 8.
  - A row is inserted and removed within its group by binary search on its row and a block move, so storage order holds; a spawn's row is the highest in its archetype, so it appends.
  - `patch` in `up.ts` runs in two phases over the entities whose slot may have changed: every removal first, so no two slots of a group share a row, then every insertion, or a parent row set in place for a slot that stays.
  - A full group moves to the end of the buffer with twice its slots; the buffer compacts, in run order and dropping empty groups, once unused slots outnumber the rows.
  - `load` lays out a full build: depths from the tree, a counting sort by depth that keeps storage order, and rows grouped by parent archetype.
- **Full builds:** the tree when the journal dropped entries a system hadn't read; the order then too, and when more than a quarter of its rows, at least 1024, would move.
- **Filtered runs** mark entities into buckets by depth: rows passing their own filters or with a newer `through` tick, from chunk ticks; children of parents whose read values changed; and the journal's entities whose parent, matching or archetype changed, with the children of those that stopped matching or moved archetype. Each listed row marks its children. A depth with few marked rows is sorted by archetype, parent archetype and row; one with more than an eighth of the matched rows, at least 4096, is listed by scanning its groups in order. After a full build of the tree every row runs once.
- **Runs:** a full run reads every group of a depth; the GPU uploads the slot buffer, spare slots included, when the order changes, and dispatches each group from its start.

## Memory

- **Per `up` system:** about 40 bytes per entity index for the tree and the order's group and row by entity, 12 bytes per slot, spare slots included, and scratch for a full build per matched row, kept for the next.
- **Journal:** 4 bytes per entry, up to the entity count.

## Not built

- **One child list per `through`, shared by every `up` system through it:** each system keeps its own tree, since levels depend on what it matches. Several `up` systems through one component in a big world would justify sharing the child lists.
- **Parent rows gathered once per run:** a swap-moved parent patches the parent row of each of its children. Wide fan-out under parents that swap-move often would justify a gather per group.
- **Uploading only patched groups to the GPU:** the whole slot buffer uploads when the order changes. Large GPU trees with small structural changes each frame would justify it.

## Not planned

- **Rows drifting out of storage order:** it would remove the block moves but change the contract, and the block moves are cheap.
- **Depth in the archetype,** as Flecs's cascade does: it splits tables, and archetype ids are positional.
