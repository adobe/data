# model

The scenarios of the ecs_benchmark suite, ported to the ECS.

Its components, its seven systems and the entities each of its benchmarks makes, with the same types and widths and
the same generator, so the same frames compute the same values as the suite's C++.

- **Frames:** `systemsUpdate` runs `MovementSystem` and `DataSystem`; `complexSystemsUpdate` all seven, over the
  entities `createUpdateEntities` makes (all heroes and monsters) or `createMixedUpdateEntities` (components removed in
  the middle, heroes and monsters on some).
- **GPU frames:** `gpuSystemsUpdate` and `gpuComplexSystemsUpdate` run the same systems as GPU kernels, over the
  entities `createGpuUpdateEntities` and `createGpuMixedUpdateEntities` make, whose data holds `dingy` as an f32, as
  GPU kernels compute, where the suite's is a double: a lane of its own, not the suite's benchmarks. `readGpuState`
  reads what they hold, to compare the GPU's frames with the CPU's.
- **Entities:** `createEntities` and `destroyEntities`; `removeAddComponent` removes component one from each and adds
  it back; the unpack systems get one, two or three components of each probe's entity through a lookup, into a
  checksum.
