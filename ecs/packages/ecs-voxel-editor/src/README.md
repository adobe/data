# Voxel editor

A voxel editor on the ECS: a WebGPU canvas for the scene, Spectrum and vanilla custom elements for the rest, every
change to the page driven by systems, as in the todo sample.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser.

## Using it

- **File menu:** New document, New model…, Choose / Reconnect library folder, Save, Save as… and Save standalone…,
  each greyed out where it doesn't apply. Those needing input ask in a dialog: a new model's name and size, a path for
  saving a new document, Save as and Save standalone. A dialog stays open with the reason when its values are refused.
- **Documents and the library:** choose a library folder, which the editor loads from and saves to; models may be kept
  in folders within it. A document has one main model and any others; saving writes its file, `*.voxel.json`, and each
  referenced model's library file it changed; "Save standalone" writes one file holding every model.
- **Models within models:** pick a model in the palette, and `+` places instances of it on the selected faces, stepping
  as far as the model reaches. Tab over an instance enters it, to edit its model in place: every instance shows the
  edit. Shift+Tab or the path above the scene steps back out; Delete removes the instance under the pointer. Editing a
  referenced model edits its library file, which the path names, with "Copy locally" to make it the document's own.
  Double-clicking a model in the palette edits it alone.
- **Palette:** what the document uses, favorites (hearts, kept as your own settings), materials, the document's models
  and the library's files by folder, filtered by kind, size and name. Model thumbnails turn while the pointer rests on
  them. Clicking a material shows its details below, each editable as you move it: its name, color, metallic and
  roughness; "Copy as a new material" starts a new one from it. Material names are
  case-sensitive, and one differing from another only in case is refused. New models are added from File > New model….
- **Select faces** of the edited model's voxel space, whether a voxel fills their cell or not: click to toggle one, drag
  to select, or deselect, as the first face became, every face passed over; hold Shift for a straight line, or Ctrl
  (or ⌘) for a rectangle, in the first face's plane, at any point in the drag. Double-click for every connected face
  like it. Escape or Alt+A deselects all. The main model's selections can be saved by name, and are kept in its file.
- **The far walls** are a checkerboard on each side of the edited model opposite the view.
- **Paint:** each voxel has a material, what it's made of, and one paint, covering whichever of its six faces are
  painted, which `paintedFaces` marks a bit each. **P**, or clicking the mode badge at the top of the view, changes
  mode. Paint mode is hard to miss: the badge turns orange, the view gets an orange frame, the edit buttons read
  "Paint +" and "Unpaint −", the palette lists only paints, and the scene shows each face's paint. There `+` paints
  the selected faces with the picked paint, and pressed again, once they're painted, extrudes them: new voxels of the
  material beneath, painted on every side. `−` takes the selected faces' paint off. Material mode shows materials.
  Thumbnails follow the mode; undo and files keep paint and which faces it covers.
- **Model size:** the edited model's size, the bounds its far walls and axes mark, set each way, from presets for cubes
  of 2 to 64, or doubled and halved; "Fit to contents" sizes it to what it holds, moved to run from 0, its instances
  elsewhere moving back so it stays put. Locked, editing and selections stop at its bounds; unlocked, extruding past
  them grows it, the negative way too, its contents moving up from 0. Undo covers sizes, and files keep the lock.
- **Edit**: `+` extrudes, moving each selected face out and filling with the picked material or model; `-` deletes the
  voxel behind each face and moves it back. Faces move through filled cells and each other, each staying its own.
- **Undo and redo** with Ctrl+Z (⌘Z) and Ctrl+Shift+Z (⌘⇧Z) or Ctrl+Y, or the toolbar.
- **Navigate** as in Blender: middle drag or Alt drag orbits freely, with Shift pans, with Ctrl zooms; two fingers on a
  trackpad orbit, with Shift pan, with Ctrl zoom; pinching and a mouse's wheel zoom; numpad 1, 3 and 7 for the front,
  right and top views, with Ctrl the opposite; Home frames the model edited, as entering or leaving one does.

## Structure

The sample follows the `@adobe/ecs` architecture standard (`@adobe/ecs-architecture`).

```
index.html            the page: File menu, toolbar, library bar, edit path, palette, saved selections and the canvas
view/                 the foundation's DOM helpers: root, on, all, define
elements/             the foundation's elements: <menu-button>, a dropdown of actions, and <form-dialog>
ports/                the foundation's input: surface, the canvas pointer input comes from
features/
    voxels/model/     models, voxels and instances; the main model, editing, and their transforms
    instances/        entering, leaving and removing instances; the edit path
    materials/        named materials and paints, how they look: color, metallic and roughness; the material/paint mode
    camera/           the orbit camera, framing what's edited, and Blender's navigation as ports
    selection/        selected faces, picked in the edited model; named selections
    edit/             extruding with a material or a model, deleting, and painting, through the selection; the mode switch
    history/          undo and redo: records changes itself, knowing nothing of the edits
    document/model/   the file format, loading, referencing library models, and saving
    library/          the library folder through the File System Access API, and its status bar
    file/view/        the File menu: new documents and models, the library folder, saving, with dialogs
    palette/          what to fill with, favorites and filters
    thumbnails/view/  how each model looks, drawn as turning isometric thumbnails
    sizing/           a model's size: resizing, fitting to contents, locking it, and growing it as edits pass its bounds
    scene/view/       the WebGPU renderer: render systems drawing from the GPU copy of the components
    main/view/        the app: entry.page.ts starts it; createApp creates the world and starts every plugin
```

## Data

A model's voxels are its children, each at its cell. An instance places a model within another, so editing a model
changes every instance of it. Referenced models keep their library file as their `source`. A selected face is an entity
of its own, a model's cell and side, so the selection is data that systems edit and the renderer draws. Cells outside a
model count as filled, which makes its far walls' faces ordinary faces.

## Still to come

- Treating faces that enclose a region as selecting the whole region, for operations that act on volumes.
- Rotating instances: they carry a rotation, which drawing, picking and editing within them follow, but nothing turns
  them yet.
