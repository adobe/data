# Saving chunks

A world split into chunks by a [shared component](03-chunks.ts#L11), `shared: true`, holds each chunk's entities in archetypes of their
own. `snapshot({ world, where })` takes the entities of the archetypes holding `where`'s values, as a system's `where`
of values keeps it to them: [`where: { [chunk]: [2, 0] }`](03-chunks.ts#L47) reads chunk 2's archetype whole and
nothing else, so a chunk's snapshot costs what the chunk holds, not the world.

- **Values only:** `where` names shared components, each with a value of its type, which the archetype must hold.
  Naming another component is a type error, and fails the snapshot as data.
- **Loading back:** `spawn` puts each entity into the archetype of its saved shared values, so the chunk
  [unloaded and loaded again](03-chunks.ts#L52-L56) is back where it was.
- **Loading what's partly there:** with [`match: [byTree]`](03-chunks.ts#L62), the trees still standing keep their entities and
  only those cut down are spawned again.
