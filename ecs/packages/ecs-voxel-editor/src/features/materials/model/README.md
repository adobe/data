# model

Materials: what a voxel is filled with, one entity each, and how it looks: a name, a base color, and how metallic and
rough it is, which the scene draws them by.

Materials are named, unique in a document and case-sensitive. `updateMaterial` changes how a material looks,
`renameMaterial` its name, refusing one taken or differing from one taken only in case, and `copyMaterial` adds a copy
of one, which is how a new material starts; `materialsRevision` counts their edits. `materialNamed` finds one by name.

Paints are materials tagged `isPaint`: what a voxel is coated with rather than made of. `layer` is the mode editing is
in, `"material"` or `"paint"`, which `setLayer` switches.

`seedMaterials` spawns each standard material, asphalt among them, and each standard paint, white, safety yellow and
other common colors, that a world lacks by name, and selects the first of each where none is; `selectedMaterial` is the
material new voxels are filled with and `selectedPaint` the paint painting coats them with. `materials` lists them, in the order they were spawned.
