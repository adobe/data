# view

The particles app: a world on the GPU device, the canvas attached as a surface with a view of it, the particles
spawned, and a frame run per animation frame.

`entry.page.ts`, which `index.html` loads, starts it. The page's mode picks the frame: `move` or `moveOnCpu` beside the
particles' `drawFrame`, or `drawFrame` alone.
