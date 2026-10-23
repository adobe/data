# Transfers sample

Shows how values that can't be copied between threads reach the thread that uses them. A canvas and decoded textures
are moved, not copied, to the world's worker, which draws sprites with them every frame. Components and resources
holding such values are registered with `transfer: true`, and a run's input carries them to the world's thread.

`pnpm sample`, then open `/transfers/`. Numbered discs appear one at a time, 48 in all, and bounce around the canvas;
the overlay counts the sprites and frames.

## Threads

- **Main** (`main.ts`) owns the page. It starts both workers, hands each a port to the world, and joins the world. It
  moves its `<canvas>` to the world's thread with `transferControlToOffscreen()`, as the input of a run of
  `attachSurface`, and adds `show`, an observer system that writes the counts into the overlay after each frame that
  changes them.
- **The world's worker** (`world.ts`) creates the world, which ticks every frame, and shares it on the ports main
  sends. The canvas becomes its `surface` resource.
- **The loader's worker** (`loader.ts`) joins the world and makes one image every 120 ms: it draws a disc of its own
  hue, encodes it as a PNG, decodes it to an `ImageBitmap` and runs `addSprite` with it. The bitmap is detached in the
  loader once the run is posted.

## Data and systems

`sprites.ts` holds them, and every thread imports it:

- `texture`, a component registered with `transfer: true`, holds a sprite's `ImageBitmap`; `position` and `velocity`
  are `Vec2`s, in pixels and pixels per second.
- `surface`, a resource registered with `transfer: true`, holds the `OffscreenCanvas`; `stats` counts sprites and
  frames.
- `attachSurface` and `addSprite` take what main and the loader move in their input. `frame`, the composite the world
  adds, clears the canvas, moves each sprite, bouncing off the edges, and draws each one's texture where it is.

## Tests

`build.test.ts`: the sample builds as an application, with the world's worker and the loader's.
