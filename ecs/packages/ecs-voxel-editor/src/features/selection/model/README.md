# model

The selection: faces of the root model's voxel space, each a cell's side, whether a voxel fills the cell or not.
A face is a model's (its `parent`'s) cell `faceCell` and its side `faceSide`, `0` to `5` for `+x`, `-x`, `+y`, `-y`, `+z` and `-z`
(`normalOf`); each selected face is an entity, listed by `faces`. Cells outside the model count as
filled: the faces of its far walls, where a ray leaves it, are their sides facing in.

Selecting is what a pointer does over the view, at a point `x`, `y` from -1 to 1 across it, of a given `aspect`:

- `pressSelect` picks the face under the pointer and toggles it; the drag that follows selects, or deselects, as that
  first face became.
- `dragSelect` extends it: over every face the pointer passes, or with `line` the faces in a straight line from the
  first, or with `rect` those in a rectangle, both in the first face's plane, each move replacing what the last chose.
- `releaseSelect` ends it.
- `selectConnected` selects, or deselects, every face connected to the one under the pointer: those in its plane,
  facing its way, reached through faces like it, filled behind and open in front as it is.
- `clearSelection` deselects every face.

Picking casts the ray through the pointer across the model's cells, from the camera, to the first filled one.

Only the main model's selection is kept as you move between models. Its selections can be saved by name,
`saveSelection`, and selected again, `restoreSelection`, in place of the selection or beside it; `namedSelections`
holds them, and the document's file keeps them.
