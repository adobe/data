---
name: archetypes
description: Build or edit the archetypes/ part of a feature's data layer.
---

Build the requested archetypes under `data/archetypes/`.

The `structure/data/archetypes` rule holds the authoring guidance — UpperCase
naming, `satisfies Array<keyof typeof components>`, and extension by spreading.
Follow it. Worked examples:
@see ../structure/references/data/archetypes/*.ts

One declaration per file, plus the `index.ts` barrel re-exporting each.
Deriving types from archetypes is a separate phase — see `archetype-to-type`.
