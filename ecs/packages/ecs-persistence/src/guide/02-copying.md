# Copying between worlds

Copying entities from one world into another is a snapshot spawned there, without bytes.
`snapshot({ world, by: file, root })` takes [`root`](02-copying.ts#L51) and every entity it owns, directly or through
others, by owner references its trait covers; `with` and `not` take the entities a query matches.

- **Entities outside:** an entity value naming one that's left out does what despawning it would. A copied entity
  [owned by one left behind](02-copying.ts#L65-L67) isn't spawned, nor anything it owns, and `dropped` counts them; a
  weak reference to one is left out; any other value naming one is `Entity.none`.
- **The new entities:** `entities` maps each copied entity to its copy. `entities: false` leaves the map out, for a
  large copy that doesn't need it.
- **Merging:** `match` takes unique indexes saying which entities are the same in both worlds: one an index holds in
  the world, with the key of one copied, stands for it and keeps its own values. Copying the fleet into the harbor
  again with [`match: [byLabel]`](02-copying.ts#L59) copies nothing twice. Each part of a key must be one the
  snapshot's trait covers, and two copied entities with one key fail the merge.
