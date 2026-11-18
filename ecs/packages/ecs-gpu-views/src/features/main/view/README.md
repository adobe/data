# view

The app's two entries: `entry.page.ts` starts the page, and `entry.world-worker.ts` the world on its worker. It exports
nothing.

- The page, which `index.html` loads, starts the world's worker and joins the world. It moves each
  `<canvas>` to the world's thread as the input of a run of `Surface.attach`, and `Surface.observe` sends each canvas's
  size in device pixels whenever it changes. It spawns the views and the points, and adds a readonly system writing the
  frame count into the overlay.
- The world's worker creates the world, which ticks every
  frame, starts the points' model and view plugins, keeps it supplied with a device with `Device.keep`, and shares it
  on the port main sends.
