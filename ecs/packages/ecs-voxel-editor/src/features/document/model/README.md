# model

The document and its files. A document's file, `*.voxel.json` (`VoxelFile`), holds its main model's name, its
materials, and its models by name, each embedded or a reference to a model of a library file, with each model's
thumbnail and the main model's saved selections. An embedded model's voxels are runs of material names, so materials
merge by name.

- `loadDocument` opens a document from its file and those it references, as texts by path: each model a referenced
  file holds keeps that file as its `source`, which saving writes it back to.
- `addReference` brings a library file's main model into the document, to place instances of it.
- `serializeDocument` gives the files to save: the document's own, and each referenced model's library file; or, with
  `standalone`, the document's own file alone, holding every model.
- `nameDocument` names the path the document is saved to; `document` holds it.

Loading merges materials by name: a material the document has keeps its properties, and one whose name differs from
one it has only in case is an error, reported, which takes the one it has.
