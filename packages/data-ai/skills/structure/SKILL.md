---
name: structure
description: Use when deciding file/folder layout, dependencies, package boundaries, or scaffolding a feature.
---

Lay out or scaffold feature code.

The `structure` rule tree holds the guidance — the feature layers, their
dependency direction, and each layer's authoring rules. Follow it. Worked
examples of a full feature:
@see ./references/**/*.ts

Code is organised by feature; no source file lives outside a feature
folder (folders may nest to group sub-features). Build a feature bottom-up
so each layer can import the one below (`ui → ecs → services → data`):

1. `data/` — data-type namespaces (schema + type + pure helpers).
2. `services/` — async capability contracts.
3. `ecs/` — components, resources, archetypes, computed, indexes,
   transactions, and the layered `core → index → transaction → computed →
   service` plugins.
4. `ui/` — user interface.

Do only the layer(s) asked for; leave the rest to their own phases.
