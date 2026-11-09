# model

The scenarios of the ecs_benchmark suite, ported to the ECS.

Its components, its seven systems and the entities each of its benchmarks makes, with the same types and widths and
the same generator, so the same frames compute the same values as the suite's C++.

- **Frames:** `systemsUpdate` runs `MovementSystem` and `DataSystem`; `complexSystemsUpdate` all seven, over the
  entities `createUpdateEntities` makes (all heroes and monsters) or `createMixedUpdateEntities` (components removed in
  the middle, heroes and monsters on some).
- **Entities:** `createEntities` and `destroyEntities`; `removeAddComponent` removes component one from each and adds
  it back; the unpack systems get one, two or three components of each probe's entity through a lookup, into a
  checksum.
