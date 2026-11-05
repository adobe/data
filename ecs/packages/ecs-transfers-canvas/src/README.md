# Transfers sample

Shows how values that can't be copied between threads reach the thread that uses them. A canvas and decoded textures
are moved, not copied, to the world's worker, which draws sprites with them every frame. Components and resources
holding such values are registered with `transfer: true`, and a run's input carries them to the world's thread.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the
Transferred Sprites tab. Numbered discs appear one at a time, 48 in all, and bounce around the canvas; the overlay
counts the sprites and frames.

## Threads

The three threads' entry points are in `app/`:

- **Main** (`app/main.ts`) owns the page. It starts both workers, hands each a port to the world, and joins the
  world. It moves its `<canvas>` to the world's thread with `transferControlToOffscreen()`, as the input of a run of
  `attachSurface`, and adds `show`, a readonly system that writes the counts into the overlay after each frame that
  changes them.
- **The world's worker** (`app/world.ts`) creates the world, which ticks every frame, adds the sprites' model and
  view systems, and shares the world on the ports main sends. The canvas becomes its `surface` resource.
- **The loader's worker** (`app/loader.ts`) joins the world and runs the sprites' `loadSprites`, which makes one image
  every 120 ms: it draws a disc of its own hue, encodes it as a PNG, decodes it to an `ImageBitmap` and runs
  `addSprite` with it. The bitmap is detached in the loader once the run is posted.

## The sprites feature

`features/sprites/` holds the data and systems every thread imports, in three layers:

- `model`: `texture`, a component registered with `transfer: true`, holds a sprite's `ImageBitmap`; `position` and
  velocity are `Vec2`s, in pixels and pixels per second. `surface`, a resource registered with `transfer: true`, holds
  the `OffscreenCanvas`; `stats` counts sprites and frames. `attachSurface` and `addSprite` take what main and the
  loader move in their input, and `move` moves each sprite, bouncing off the edges.
- `view`: each frame, clears the canvas and draws each sprite's texture where it is.
- `ports`: `loadSprites`, the loader's textures.

`ARCHITECTURE.md` draws the features and what uses what.

## Tests

- `build.test.ts`: the sample builds as an application, with the world's worker and the loader's.
- `architecture.test.ts`: the source follows the architecture standard, and its diagrams and the repository's agent
  rules are up to date.
