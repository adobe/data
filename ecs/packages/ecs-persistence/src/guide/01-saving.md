# Saving and loading

A component or resource persists when its declaration names it with the [`persist` trait](01-saving.ts#L13-L15):
`[persist]: "position"`. The name is what saved data calls it, the same across versions and moves of its module. Only
data persists, a value with a schema, and never a derived component; `selected` here has no name, so it isn't saved.

- `snapshot({ world })` takes every entity holding a persisted component, and the persisted resources, as columns.
- `encode(snapshot)` writes them as bytes, and `decode(bytes)` reads them back, viewing each column where it is.
- `spawn({ world, snapshot })` spawns an entity for each saved one and sets the resources. Entity values name the
  entities spawned for theirs: the archer [targets the tower](01-saving.ts#L24-L25) again. Its result's `entities`
  maps each saved entity to its new one.

Each says why it didn't happen as `{ failure }`, rather than throwing, so `result.failure !== undefined` tells which.
