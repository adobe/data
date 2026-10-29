# Sync points

A run ends at a *sync point*, where its commands apply.

- **Values** written to rows and resources apply at once.
- **Commands** wait for the sync point, then apply in the order issued. `commands.spawn` returns the new entity at
  once, so [later commands can name it](06-sync-points.ts#L16-L21): `commands.add` sets the hero's health to 5. An
  entity spawned and removed with `commands.despawn` before the sync point never exists.

A composite is one run with one sync point. In [`frame`](06-sync-points.ts#L25), `count` runs `after: [spawn]` but
before the spawned entities exist, so it counts none; run alone, after the sync point, it counts the hero.

A readonly system added to a world runs after the sync point of every run and tick, reading what it left:
[`watch`](06-sync-points.ts#L39-L41) logs the hero after the run that spawned it.
