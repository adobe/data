# view

Draws the points into every view, each with a camera of its own.

`spawnViews` adds two views side by side on the main surface and one from above on the map's. Each frame, `aim`
writes each view's `View.projection`, fitting its shape on its surface, before `Frame.update` writes it to the view's
uniform, and `draw`, a render system, draws every point into every view with `View.begin`, its pipeline cached per
device and per what it depends on of the target: format, samples and depth format.
