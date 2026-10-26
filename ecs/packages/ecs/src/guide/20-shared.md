# Shared components and where

A *shared* component's value belongs to its archetype: entities with equal values share one archetype, which holds the
value once. [`cell`](20-shared.ts#L16), declared `shared: true`, is the chunk of the world a unit is in, so each
chunk's units share an archetype.

- A spawner's first call takes *constants*, values every entity it spawns starts with:
  [`commands.spawn(Unit, { [cell]: [x, y], ... })`](20-shared.ts#L31-L39). The shared ones choose the archetype; the
  others, here every unit's velocity, start each entity's own value. The spawner's call takes the rest.
- A row reads `row[cell]` as its archetype's value, read-only: [`place`](20-shared.ts#L41-L43) reads it, and as a
  kernel takes it as a parameter of each call over an archetype, not as a column.
- Assigning a shared component is a type error. `commands.add` with another value
  [moves the entity](20-shared.ts#L49-L53) to that value's archetype, creating it if needed.

**`where`** keeps a system to the archetypes whose shared values pass:

- A value passes the archetypes holding an equal one: [`where: { [cell]: [4, 0] }`](20-shared.ts#L77-L79) counts only
  the chunk the step's crossing units move into.
- A predicate of the value and the resources passes those it returns `true` for: [`draw`](20-shared.ts#L58-L65) visits
  only the chunks the camera sees.

A predicate runs once per archetype as the archetype appears, and again for every archetype only after a resource it
reads changed, never per row or per run. The camera counts what it's asked: every chunk for each of the two systems at
first, only the new chunks after the step, nothing while nothing changed, and every chunk again once
[`look`](20-shared.ts#L92-L94) writes a new camera. Since the world caches the results, the build rejects a predicate
that reads anything but its value, the resources and module constants.

With a change filter, a chunk out of view keeps its rows unseen: [`refresh`](20-shared.ts#L67-L73) counts, when the
camera moves, the rows that changed while their chunk was out of view, through `changed: [position]`.
