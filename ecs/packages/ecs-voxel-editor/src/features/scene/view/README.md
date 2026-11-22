# view

The scene, drawn with WebGPU through `@adobe/ecs-gpu`: `sceneView` moves the page's `canvas.scene` to a surface the
world presents to, sized as it's laid out, spawns a view of the whole of it, and draws each frame the world ticks.

- `aimView` aims the view through the camera, before `Frame.update`, and gives the shaders the sky's inverse projection,
  the eye, and the root model's size and scale, each only as it changes.
- `drawScene` and `drawSelection` are render systems. They draw the voxels and selected faces straight from the GPU
  copy of their components, `position`, `faceCell` and `faceSide`, which the world uploads from storage as rows change,
  with no copy made per frame. Each draws in a sorted index's order, `drawnVoxels` and `faces`, keyed by model, so a
  model's rows are one range of it.
- `bindDrawList` lists what a frame draws, `drawList`: from the main model, or a model edited alone, down through its
  instances, each model's range of voxels once per place it appears with the matrix taking it to the world, which the
  voxel shader reads at a dynamic offset per draw; and the model being edited, whose walls, axes and selected faces are
  drawn through its matrix.
- Shaders can't read an entity, which is 64 bits, so a voxel's `material` reaches the GPU as `materialSlot`, its
  material's slot in the material table, which `bindMaterialTable` writes as materials change and `addSlots` and
  `updateSlots` keep beside each voxel's `material`. Its paint reaches it as `paintSlot`, the paint's slot shifted up 6
  bits over the faces it shows on, none outside paint mode, so the shader picks each face's slot.

What it draws:

- a procedural sky behind everything, a gradient from the ground through the horizon to the zenith, with a sun;
- the edited model's far walls, the inside of a box around it whose sides facing the camera are culled, so the walls
  opposite the view always show, each a checkerboard of the voxels' cells;
- the edited model's axes from its origin, `x` red, `y` green and `z` blue, each as long as the model;
- every model's voxels, once per place it appears, physically based: each material's base color, metallic and roughness, lit by the sun through a GGX
  microfacet BRDF and by the sky as image-based light, diffuse and specular, then tone mapped; edges a little darker;
- the selected faces over them, translucent, with a rim.
