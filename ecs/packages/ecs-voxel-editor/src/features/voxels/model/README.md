# model

Models and the voxels and instances within them.

- **A model** (`Model`) is a grid of `size` voxels, each `scale` world units wherever it's placed, named by `modelName`,
  unique in its document. A model referenced from the library has its file's path, `source`, which saving writes it
  back to.
- **Size:** a model's `size` bounds what's edited in it; one marked `sizeUnlocked` grows as edits pass its bounds.
- **A voxel** (`Voxel`) is a cell, `position`, of its `parent` model, filled with a `material`.
- **An instance** (`Instance`) places a model, `instanceOf`, within its `parent` model, its origin at `position` in the
  parent's voxels, turned by `rotation`. Editing a model changes every instance of it at once, since its voxels are the
  model's. `instancesOf` lists the instances placing a model. `contains` tells whether placing one model in another would place it within itself.
- **The document** has one `mainModel`, the root of everything drawn; `newDocument` starts one.
- **Editing**, `editing`, names the model being edited: from a root, the main model or another shown alone, through a
  chain of instances entered from it. `editFrame` gives it, its size and scale, and the matrix taking its voxels to the world, which
  `rayInto` uses to bring a ray into its voxels and `castRay` to find the face a ray reaches. `placements` lists every
  model to draw, once per place it appears, with its matrix.
