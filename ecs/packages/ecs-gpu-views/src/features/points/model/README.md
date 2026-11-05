# model

Points turning around the vertical axis, at speeds of their own.

A point has its `place`, its `spin` in radians per second and its `hue`. `spawnPoints` makes a ring of rings of them,
`turn`, a GPU kernel, turns them each frame, and `frames` counts the frames.
