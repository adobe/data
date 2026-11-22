# model

Editing the root model's voxels through the selection. Every selected face always moves on its own: faces move through
filled cells and through each other, and two faces at one side stay two faces.

- `paintSelection` paints each selected face with the selected paint, which becomes its voxel's one paint, covering
  its other painted faces too, or, `remove`, takes it off; it returns whether any face changed. In paint mode,
  `extrudeSelection` fills with the material each face is a face of, painted on all six sides. `currentLayer` tells input which mode it's in: there `+` paints the
  selected faces, and extrudes them once they're painted already, and `−` takes their paint off.
- `extrudeSelection` moves every selected face one voxel the way it faces, filling the cell it moves into with the
  selected material where it's empty. Past the model's bounds, a face stays where the model's size is locked; where
  it's unlocked, the model grows to hold what's filled, its contents moving up from 0 where it grows the negative way.
- `deleteSelection` empties the cell behind every selected face and moves the face back one voxel, onto the side of the
  cell behind it that faces the same way. A face of the model's walls stays.
