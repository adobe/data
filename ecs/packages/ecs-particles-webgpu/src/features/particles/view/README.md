# view

Draws the particles with WebGPU, as points into every view.

Positions wrap, so particles leaving one side of the field come back on the other.

`spawnView` adds a view of the whole of a surface; `systems` are a frame of the GPU's work, through `@adobe/ecs-gpu`'s
`Frame`, with the particles drawn after whichever move ran. The app runs its frames, so it adds `Frame.releases`.
