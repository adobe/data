# Saving and loading

Saved data names each component and resource by a name of its own, the same across versions and moves of its module.
A trait of the application's own gives it: [`file`](01-saving.ts#L5-L6), a `Symbol()`
[declared as a trait](01-saving.ts#L14-L16) whose value is a string, names a key on its declaration,
[`[file]: "position"`](01-saving.ts#L18), as it's saved in a file. Only data is saved, a value with a schema, and never
a derived component; `selected` here has no name, so it isn't saved.

- `snapshot({ world, by: file })` takes every entity holding a component the trait covers, those components alone,
  and the resources it covers, as columns.
- `encode(snapshot)` writes them as bytes, and `decode(bytes, { by: file })` reads them back, viewing each column
  where it is.
- `spawn({ world, snapshot })` spawns an entity for each saved one and sets the resources. Entity values name the
  entities spawned for theirs: the archer [targets the tower](01-saving.ts#L29-L30) again. Its result's `entities`
  maps each saved entity to its new one.

`snapshot`, `decode` and `spawn` each say why it didn't happen as `{ failure }`, rather than throwing, so
`result.failure !== undefined` tells which. `encode` takes a snapshot one of them gave and always gives its bytes.
