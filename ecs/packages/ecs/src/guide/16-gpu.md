# GPU kernels and render systems

A world given a WebGPU device, `World.create({ [gpuDevice]: device })`, keeps a GPU copy of the components its GPU
systems use.

**GPU kernels.** `kernel: "gpu"` runs [the body](16-gpu.ts#L16-L18) as a compute shader over that copy, and as a kernel
on the CPU in a world without a device, as here. Its rows hold 32-bit numbers and vectors of them, and it has no
lookups, change filters or commands.

**Render systems.** `System.render` records draws over the GPU copy of the components its `accessors` name, in a world
with a device; without one it's skipped. [Its body](16-gpu.ts#L23-L32) gets an encoder and `tables`, each a group of
matching rows to draw: `table.bind(pass)` binds its rows, and `table.count` says how many there are.

- `Gpu.wgsl(draw)` gives the WGSL functions its shaders call, one per accessor, such as
  `fn dotPosition(row: u32) -> vec2<f32>`.
- `Gpu.layout(device)` gives the bind group layout its pipeline takes.

The guide says whether this browser has WebGPU.
