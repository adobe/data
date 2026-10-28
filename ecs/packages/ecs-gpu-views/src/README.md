# Views sample

A world on a worker draws 4,096 turning points into two canvases through `@adobe/ecs-gpu`. The large canvas is
multisampled and holds two views side by side, one orbiting and one from the side; the small one shows the points from
above. Each canvas keeps its size on the page as the window changes. The page needs a browser with WebGPU.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the
GPU Views tab.

## Threads

- **Main** (`main.ts`) owns the page. It starts the world's worker and joins the world. It moves each `<canvas>` to the
  world's thread as the input of a run of `Surface.attach`, and `Surface.observe` sends each canvas's size in device
  pixels whenever it changes. It spawns the views and the points, and adds `show`, an observer system writing the
  frame count into the overlay.
- **The world's worker** (`world.ts`) creates the world, which ticks every frame, keeps it supplied with a device with
  `Device.keep`, and shares it on the port main sends.

## Data and systems

`scene.ts` holds them, and both threads import it:

- `place`, `spin` and `hue` make a point; `camera` on a view says where it looks from; `frames` counts frames.
- `turn`, a GPU kernel, turns each point around the vertical axis.
- `aim` writes each view's `View.projection`, fitting its shape on its surface, before `Frame.update` writes it to the
  view's uniform.
- `draw`, a render system, draws every point into every view with `View.begin`, its pipeline cached per device and per
  what it depends on of the target: format, samples and depth format.
- `frame` is a tick: `turn`, `aim`, `Frame.systems`, `draw`, and the frame count.

## Tests

- `build.test.ts`: the page builds as an application, with the world's worker, which presents the canvases, and the
  GPU kernel in a chunk of its own.
- The sample browser's `site.page.test.ts` runs it from the built site, its world drawing frame after frame.
