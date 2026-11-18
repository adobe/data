# view

Draws the particles with WebGPU, as points into every view.

Positions wrap, so particles leaving one side of the field come back on the other.

`spawnView` adds a view of the whole of a surface; `drawFrame` is a frame of the GPU's work, through `@adobe/ecs-gpu`'s
`Frame`, with the particles drawn after whichever move ran beside it. The app runs its frames rather than adding them,
so `particlesView`, its plugin, adds `Frame.releases`, which releases what their updates make.
