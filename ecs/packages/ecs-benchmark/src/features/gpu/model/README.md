# model

The suite's frames as GPU kernels: a lane of its own, not the suite's benchmarks. `gpuSystemsUpdate` and
`gpuComplexSystemsUpdate` run the same systems as `cpu`'s frames over the entities `createGpuUpdateEntities` and
`createGpuMixedUpdateEntities` make, whose `gpuData` holds `dingy` as an f32, as GPU kernels compute, where the suite's
is a double. `readGpuState` reads what they hold, to compare the GPU's frames with the CPU's.
