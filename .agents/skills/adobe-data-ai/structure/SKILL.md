---
name: structure
description: Use when deciding file/folder layout, dependencies, package boundaries, or scaffolding a feature.
---

Lay out or scaffold feature code.

The `structure` rule tree holds the guidance — the feature-folder layers,
their dependency direction, and each layer's authoring rules. Follow it.
Worked examples of a full feature:
@see ./references/**/*.ts

Code is organised by feature; no source file lives outside a feature
folder (folders may nest to group sub-features). Build a feature bottom-up
so each layer can import the one below:

1. `data/` — components, archetypes, resources.
2. `types/` — pure data + helpers (derive archetype-backed types via
   `archetype-to-type`).
3. `services/` — async ports.
4. `database/` — core → index → transaction → computed → service plugins.
5. `elements/` — UI.

Do only the layer(s) asked for; leave the rest to their own phases.
