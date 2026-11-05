# model

Particles over four archetypes, by `visible` and `enabled`.

They're the ECS's perf particles on screen, with positions in pixels and velocities in pixels per frame.

`spawn` places them deterministically, so every mode starts from the same particles. `move` moves the visible,
enabled ones in a kernel on the GPU, and `moveOnCpu` does the same in a kernel on the world's workers.
