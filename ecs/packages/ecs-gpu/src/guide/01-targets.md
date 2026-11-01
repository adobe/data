# Render targets and views

A *render target* is an entity with [`Target.options`](01-targets.ts#L8), what its textures are, and `Target.size`, in
pixels. The options are its color format, its samples per pixel, its depth format and the color it's cleared to each
frame; `Target.Options.default` has one sample and a depth buffer. With a device, `Target.states` holds its textures.

A *view* is an entity drawing into part of a target: `View.target` names the target, `View.viewport` its rectangle in
it, as fractions of its size, and `View.projection` the matrix taking its scene to clip space.
[Two views](01-targets.ts#L9-L10) split the screen in halves.

- **Owned:** `View.target` is an owner reference, so [despawning the target](01-targets.ts#L27) takes its views with it.
- **Shaders:** `View.wgsl(1)` gives the WGSL declaring a view's uniform at bind group 1, as `view.projection` and
  `view.size`, which `View.layout(device)` describes.
