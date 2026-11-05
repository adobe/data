# Views sample

A world on a worker draws 4,096 turning points into two canvases through `@adobe/ecs-gpu`. The large canvas is
multisampled and holds two views side by side, one orbiting and one from the side; the small one shows the points from
above. Each canvas keeps its size on the page as the window changes. The page needs a browser with WebGPU.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the
GPU Views tab.

## Threads

The two threads' entry points are in `app/`:

- **Main** (`app/main.ts`) owns the page. It starts the world's worker and joins the world. It moves each `<canvas>` to
  the world's thread as the input of a run of `Surface.attach`, and `Surface.observe` sends each canvas's size in
  device pixels whenever it changes. It spawns the views and the points, and adds `show`, a readonly system writing
  the frame count into the overlay.
- **The world's worker** (`app/world.ts`) creates the world, which ticks every frame, adds the points' model and view
  systems, keeps it supplied with a device with `Device.keep`, and shares it on the port main sends.

## The points feature

`features/points/` holds the data and systems both threads import:

- `model`: `place`, `spin` and `hue` make a point, and `spawnPoints` a ring of rings of them; `turn`, a GPU kernel,
  turns each point around the vertical axis; `frames` counts frames.
- `view`: `camera` on a view says where it looks from, and `spawnViews` adds the three views. `aim` writes each view's
  `View.projection`, fitting its shape on its surface, before `Frame.update` writes it to the view's uniform; `draw`,
  a render system, draws every point into every view with `View.begin`, its pipeline cached per device and per what
  it depends on of the target: format, samples and depth format.

`ARCHITECTURE.md` draws the features and what uses what.

## Tests

- `build.test.ts`: the page builds as an application, with the world's worker, which presents the canvases, and the
  GPU kernel in a chunk of its own.
- `architecture.test.ts`: the source follows the architecture standard, and its diagrams and the repository's agent
  rules are up to date.
- The sample browser's `site.page.test.ts` runs it from the built site, its world drawing frame after frame.
