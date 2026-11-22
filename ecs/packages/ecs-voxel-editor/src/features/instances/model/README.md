# model

Working with instances, models placed within others.

- `enterInstanceAt` enters the instance under the pointer, placed in the model being edited, to edit its model in
  place: edits apply to the model, so every instance of it shows them. `leaveTo` steps back out, to any depth.
- `editModel` edits a model shown alone, or the main model in the whole scene.
- `deleteInstanceAt` removes the instance under the pointer; its model stays in the document.
- `makeLocal` makes a model referenced from the library the document's own.

Only the main model's selection is kept: leaving another model deselects its faces.
