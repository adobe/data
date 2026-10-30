# Devices, surfaces and frames

`Device.request()` gives a WebGPU device, or null where there's none, and a world drawing with it takes it as
[`gpuDevice`](02-frames.ts#L20-L21). `Device.keep(world)` sets it and asks again each time it's lost.

- **Surfaces:** `Surface.attach` makes a render target presenting to a canvas, an `OffscreenCanvas`, so the world may
  run on a worker. [Here](02-frames.ts#L26-L27) it takes the page's canvas; `Surface.observe` keeps the target the
  canvas's size on the page, in device pixels.
- **Frames:** `Frame.systems` brings targets, surfaces and views up to date with the device and clears each target, then
  presents each surface. A frame runs them with its draws between, which declare
  [`after: [Frame.update], before: [Frame.present]`](02-frames.ts#L6-L8).
- **Passes:** `View.begin(encoder, view)` begins a pass drawing into a view, limited to its rectangle.

Without a device, as in node, the world runs the same systems and draws nothing: a frame still updates
`View.states`, to no views.
