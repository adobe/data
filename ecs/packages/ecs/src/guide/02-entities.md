# Entities, components and archetypes

An *entity* is an id. A *component* is a key whose values entities hold, [declared](02-entities.ts#L8-L15) in
`Components` as a resource is. A component of `type: true` is a *tag*: an entity has it or doesn't, with no value.

An *archetype* is a list of components declared `as const` at module scope, such as
[`Particle`](02-entities.ts#L17). The build indexes it, and it goes wherever a list of components does. The world
stores entities with the same set of components together.

Systems change which entities exist through `commands`:

- `commands.spawn(components)(values)` [spawns an entity](02-entities.ts#L19-L22) with those components. A
  component left out of the values, such as the tag, starts at its default.
- `commands.add` and `commands.remove` add and remove components; `commands.despawn` removes the entity. Here
  [`defeat`](02-entities.ts#L24-L26) removes the tag, so the entity stops being a foe.

A system with `components: { with: [...] }` runs once per entity that has every listed component, its *row*, which
holds those values. `with: [...Particle]` spreads an archetype into a list. Since `defeat` removed the tag,
[the last read](02-entities.ts#L42) finds no foe and logs nothing.
