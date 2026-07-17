---
name: resources
description: Build or edit the resources/ part of a feature's data layer.
---

Build the requested resources under `data/resources/`.

Resources are singleton components; the `structure/data/resources` rule covers
how they differ from components — no struct packing, and the `default` /
`nonPersistent` descriptor form. Follow it. Worked examples:
@see ../structure/references/data/resources/*.ts

One declaration per file, plus the `index.ts` barrel re-exporting each.
