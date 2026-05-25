---
paths:
  - '**/*plugin*'
  - '**/*plugin*/**'
---

# Plugin modelling — model vs. system, authored vs. derived

Each plugin has two orthogonal axes:

1. **Authored** state — the user inserts / sets it. Designed by the human
   architect.
2. **Derived** state — a system produces it from other state. Implementation;
   owned by the AI.

The human's mental model of a project is the union of every plugin's
**authored surface**. Systems and derived state are how the world updates
and renders — read their interface contract, not their innards.

## Two tiers of model plugins

- **Core** — the primary record types every consumer reads. Small, fixed,
  shared.
- **Authoring abstractions** — higher-level intents (orbit, animation,
  procedural shape, particle emitter, constraint, …) that systems expand
  into core state. Open-ended; each project picks what it needs.

A plugin almost never holds both authored and derived data the user cares
about. If it appears to, the derived data is the *implementation* of the
authoring abstraction.

## Shared conventions

- **Uppercase identifier** = archetype. **Lowercase** = component or
  resource. Disambiguated by where declared (archetype vs. component vs.
  resource section of the data plugin).
- **Entity references** are typed `EntityId`; field names drop the `Ref`
  suffix — the type carries the signal.
- **Implementation prefixes** (`pbr`, `ibl`, …) belong in code where they
  disambiguate cross-plugin reuse. Drop them in the conceptual view.
- **`_` prefix** = ephemeral / derived / not part of the data model. The
  human ignores it when modelling; system-graph views still display it.
  Applies in code too, not just docs.
- **Inline `: Type`** only on `_`-prefixed names. Persistent items get
  their type from the data plugin where they're declared.

## Model plugin format

Authored surface only — no derived state, no systems.

```
pluginName
  components
    fieldName:  Type
    ...
  resources
    fieldName:  Type
    ...
  archetypes
    ArchetypeName: [field, field, ...OtherArchetype]
```

- `...Other` composes another archetype's component list.
- Shape comments (`// { … }`) stay on the same line; do not wrap.

## System plugin format

```
systemName              // high-level summary
  query: ArchetypeExpr [, ArchetypeExpr ...]   // omit if resource-only
  read:
    name                                       // persistent — type from data plugin
    _name: Type                                // ephemeral — type inline
  write:
    name                                       // writes a component / resource
    _Archetype                                 // creates new entities of this archetype
    // free-text side effect                   // draw calls, network sends, …
```

- `read:` and `write:` are outlined one-per-line.
- A system can have multiple independent queries; comma-separate them on
  the `query:` line.

## Query DSL

- `Archetype` — entities matching the archetype.
- `+component` — require this additional component.
- `-component` — exclude entities that have it.
- `Archetype+a-b+c` — left-to-right chain of `+` / `-`.
- `Q1, Q2, ...` — multiple independent queries the system reads from.

## Designing or discussing a plugin

1. Write the authored surface (model format) **first**.
2. Then each system as its own interface card with `query` / `read` /
   `write`.
3. The graph of `write:` → `read:` edges is the implementation; the union
   of authored surfaces is the human's mental model.
