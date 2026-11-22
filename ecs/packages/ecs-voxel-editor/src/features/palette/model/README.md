# model

The palette: what extruding fills with, and what the palette shows.

- `pickItem` picks a material to fill voxels of, or a model to place instances of, by a palette item's key; `paintWith` picks a model by its entity.
- `addModel` adds a model scaled to fill one voxel of the main model, and edits it alone.
- `paletteFilter` holds what the palette shows, materials, models or both, models of a size and those matching a
  search; `setPaletteFilter` chooses it.
- `favorites` holds the user's favorites, by key, kept as the user's own settings rather than in a document;
  `toggleFavorite` and `setFavorites` change them.
