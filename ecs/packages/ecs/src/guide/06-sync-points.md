# Sync points

A run ends at a *sync point*, where its commands apply.

- **Values** written to rows and resources apply at once.
- **Commands** wait for the sync point, then apply in the order issued. `commands.spawn` returns the new entity at
  once, so [later commands can name it](06-sync-points.ts#L16-L21): `commands.add` sets the hero's health to 5. An
  entity spawned and removed with `commands.despawn` before the sync point never exists.

A composite is one run with one sync point. In [`frame`](06-sync-points.ts#L25), `count` runs `after: [spawn]` but
before the spawned entities exist, so it counts none; run alone, after the sync point, it counts the hero.

**Readonly systems.** `readonly: true` places a system after the sync point, so it reads what the commands did. Added
to a world, [`watch`](06-sync-points.ts#L27-L29) runs after the sync point of every run and tick, and logs the hero
after the run that spawned it; `count`, which isn't readonly, runs before the sync point, in its tier.

- **Where:** a readonly system runs on the thread that added or ran it, so a [joined thread](19-threads.md) adds only
  readonly systems.
- **Order:** none. It can't declare `before`, `after` or `during`.
- **Limits:** it can't write, use `commands` or `reduce`, or take input. Its row and resources are read-only, so each
  is a type error.
