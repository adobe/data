# Particles sample

A million particles over four archetypes, moved by a kernel on the GPU or on the world's workers, and drawn with
WebGPU every frame through `@adobe/ecs-gpu`, which gives the world its device, presents the canvas and keeps it its
size on the page. The page needs a browser with WebGPU.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the GPU
Particles tab. The overlay's links switch modes: `?mode=gpu` moves particles on the GPU, `cpu` on workers, uploading
positions for drawing each frame, and `static` only draws; `?count=` sets how many to spawn, a quarter of them drawn.

## Files

```
index.html          the page: a canvas and the overlay
gpu/main.ts         starts the world on a device, attaches the canvas as a surface, spawns its view and the particles,
                    and runs a frame per animation frame
gpu/particles.ts    the data, the spawn system, the move kernels and the draw system, which draws into every view
particles.ts        a smaller simulation, falling particles moved by kernels, which particles.test.ts checks
```

## Tests

- `particles.test.ts`, in node: `particles.ts`'s frames match the same simulation in plain JavaScript.
- `build.test.ts`: the page builds as an application, with the world's worker and each kernel's `create` in a chunk
  of its own.
