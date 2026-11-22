# model

The camera the scene is seen through: an orbit about a target, from `distance` away, turned freely by a `rotation`,
so it orbits in every direction, as a trackball does, over the top and on round without stopping or flipping.

Its systems are what a user does to the view: `orbitCamera`, `turnCamera` (a turntable's turn, keeping the view level), `panCamera` and `zoomCamera` by amounts the input gives, `resetView` back to the starting view,
`viewCamera` to a fixed view, such as Blender's front, right and top, and `frameWorld` to fit the model being edited in
view, which `cameraModel` also does as editing moves to another model.
`basisOf` gives the camera's eye and axes, and `rayThrough` the ray through a point of the view, which picking uses.
