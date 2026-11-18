# model

The suite's scenarios on the CPU, so the same frames compute the same values as the suite's C++.

- **Frames:** `systemsUpdate` runs `MovementSystem` and `DataSystem`; `complexSystemsUpdate` all seven, and
  `complexSystems` lists them by name in the order a frame runs them. They run over the entities
  `createUpdateEntities` makes (all heroes and monsters) or `createMixedUpdateEntities` (components removed in the
  middle, heroes and monsters on some).
- **Entities:** `createEntities`, `createHalfComponentEntities`, `destroyEntities` and `destroyEntitiesWhere`;
  `removeAddComponent` removes component one from each and adds it back; the probe and unpack systems get one, two or
  three components of each probe's entity through a lookup, into a checksum.
