# @adobe/ecs-gpu

WebGPU for `@adobe/ecs`: the device a world draws with, the canvases it presents to, the textures it draws into, the
views it draws, and the systems that keep them current. Everything is an entity, a component, a resource or a system
of the world, so the world's thread may be the page's or a worker's, and a world may have any number of canvases,
render targets and views, or none.

It adds no frame loop: the world's own runs and ticks drive it.

## A frame

```ts
import { System, World } from "@adobe/ecs";
import { Device, Frame, Surface, View } from "@adobe/ecs-gpu";

const world = World.create();
await Device.keep(world);

const canvas = document.querySelector("canvas")!;
const surface = await world.run(Surface.attach, {
    canvas: canvas.transferControlToOffscreen(),
    width: canvas.clientWidth * devicePixelRatio,
    height: canvas.clientHeight * devicePixelRatio,
});
Surface.observe(canvas, world, surface);

// Draws go after Frame.update and before Frame.present.
const draw = System.render({ shader, after: [Frame.update], before: [Frame.present] }, ({ device, encoder, tables }, { resources }) => {
    for (const view of resources[View.states]?.values() ?? []) {
        const pass = View.begin(encoder, view);
        // set a pipeline, bind view.bindGroup, bind and draw each table
        pass.end();
    }
});

world.add(System.create({ systems: [Frame.systems, draw] }));
```

## Devices

- `Device.request(options?)` gives a device for the adapter's options and the features and limits it needs, or null
  where there's no WebGPU or no such device.
- `Device.keep(world, options?)` sets the world's `gpuDevice` and requests another each time it's lost.
- `Device.set` is the system that sets `gpuDevice`.

Call them on the world's thread, since a device can't move between threads. When the device changes, or is lost and
the world sets `gpuDevice` to null, every target, surface and view is made again on the new device, or released.

## Render targets

An entity with `Target.options` and `Target.size` is a render target.

- **Options:**
  - its color format, null for the platform's preferred canvas format;
  - its samples per pixel, 1 or 4;
  - its depth format, null for none;
  - the color it's cleared to each frame, null to keep what it holds.
- **Textures:** `Target.states` holds each target's textures on the world's device. `color` is single-sampled, for
  reading and presenting. With 4 samples, passes draw into `multisampled` and resolve into `color`. Depth textures can
  be sampled.
- **Resizing:** `Target.resize` sets a target's size in pixels.

A target without a canvas renders offscreen: for a texture a later pass samples, a picking buffer or a screenshot.

## Surfaces

A render target with `Surface.canvas` presents to an `OffscreenCanvas` on the world's thread.

- **Canvas:** a page's canvas moved with `transferControlToOffscreen()`, or an `OffscreenCanvas` of its own.
  `Surface.attach` spawns one.
- **Presenting:** `Surface.options` sets its alpha mode, color space and tone mapping. The canvas is configured in its
  target's format and always has its target's size.
- **Resizing:** `Surface.observe(element, world, surface)`, on the page's thread, keeps a surface's size the element's
  size in device pixels. It works whether the world is on the page's thread or on a worker that the page joined.

Draws go into the target's textures, and `Frame.present` copies each surface's target into its canvas in one body. So
every draw of a run is in the frame the browser shows, even where the run waited between draws, as a readback makes it
wait. That costs one copy of each surface per frame.

## Views

An entity with `View.target`, `View.viewport` and `View.projection` is a view.

- **Target:** the target it draws into, which owns it, so a view goes when its target goes.
- **Viewport:** its rectangle in that target, as fractions of the target's size.
- **Projection:** the matrix taking its scene to clip space, which a system of the application writes before
  `Frame.update`.

`View.states` holds each view's rectangle in pixels and the uniform buffer and bind group holding its projection and
size. Shaders declare them with `View.wgsl(group)`, as `view.projection` and `view.size`, and pipeline layouts take
`View.layout(device)` at that group. `View.begin(encoder, view)` begins a pass drawing into the view: it loads what the
target holds and limits the pass to the view's rectangle.

## Frames

- **`Frame.update`:** brings targets, surfaces and views up to date with their entities and the world's device, then
  clears each target that declares a clear color.
- **`Frame.present`:** presents every surface.
- **`Frame.systems`:** both, in order.

Render systems drawing into targets go after `Frame.update` and before `Frame.present`.

## Caches

`Cache.perDevice(create, keyOf?)` makes a value once per device and key: a pipeline for a target's format and sample
count, a layout, a sampler. A device that was replaced or lost takes its values with it.

## Building

This is a library of systems. It builds with Vite and `Compiler.plugin({ library: true })`, so its `dist` carries its
keys' registrations and its systems' input schemas. An application's build, with `Compiler.plugin()`, identifies them.
