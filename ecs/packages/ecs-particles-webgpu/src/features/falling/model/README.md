# model

Falling particles, moved by kernels on the world's workers. Gravity changes each one's velocity, and its velocity its
position.

`frame` runs a frame of a given length and returns the positions it left; `count` is how many particles are spawned,
on the first frame and whenever it changes.
