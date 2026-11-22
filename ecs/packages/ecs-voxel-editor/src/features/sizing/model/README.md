# model

A model's size: `resizeModel` sizes it again, its contents where they are, voxels left outside it going; `fitModel`
sizes it to its contents, moving them toward its origin so they run from 0 in each direction; `lockSize` locks its size,
so editing stops at its bounds, or unlocks it, so editing past them grows it.

`reframe` moves a model's contents and sizes it, moving each instance placing it the other way so it stays where it was
drawn, and the camera with it where it's the root of what's drawn; `reframingOf` gathers what it touches. Extruding
past an unlocked model's bounds uses them too.
