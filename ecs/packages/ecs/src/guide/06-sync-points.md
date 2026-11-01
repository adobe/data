# Sync points

A run applies its commands at *sync points*.

- **Values** written to rows and resources apply at once.
- **Commands** wait for a sync point, then apply in the order issued. `commands.spawn` returns the new entity at
  once, so [later commands can name it](06-sync-points.ts#L20-L25): `commands.add` sets the hero's health to 5. An
  entity spawned and removed with `commands.despawn` before the sync point never exists.

Every run ends at a sync point. Within it, the build tells which components each system's commands name, and a system
that follows one whose commands could change what it reads, matches, looks up or indexes gets a sync point before its
tier. In [`frame`](06-sync-points.ts#L32), `count` runs `after: [spawn]`, so the hero exists by then and it counts it;
[`early`](06-sync-points.ts#L29-L31), ordered with nothing, runs beside `spawn`, before that sync point, and counts
none. An ordering costs a little, a tier boundary, and a sync point where the earlier system's commands could change
what the later one reads, which costs more only when commands were issued: a run adds the fewest sync points that put
one between every such pair, and none where no system depends on another's commands.

**One-frame events.** An event, such as a key going down, is an entity that lives one frame. The system making
events clears those it made before and makes this frame's in one body, as
[`press`](06-sync-points.ts#L40-L43) does: `commands.despawnWhere({ with: [keyDown] })` despawns the entities with
`keyDown` that were alive before its sync point, never one the same sync point spawns, so `handle`, `after: [press]`,
reads this frame's key and no earlier one. Events many systems make are cleared instead by one system ordered `after`
a composite of everything else, which despawns them once every system has read them.

**Readonly systems.** `readonly: true` places a system after the last sync point, so it reads what the commands did.
Added to a world, [`watch`](06-sync-points.ts#L34-L36) runs after the last sync point of every run and tick, and logs
the hero after the run that spawned it; `count`, which isn't readonly, runs in its tier.

- **Where:** a readonly system runs on the thread that added or ran it, so a [joined thread](19-threads.md) adds only
  readonly systems.
- **Order:** none. It can't declare `before`, `after` or `during`.
- **Limits:** it can't write, use `commands` or `reduce`, or take input. Its row and resources are read-only, so each
  is a type error.
