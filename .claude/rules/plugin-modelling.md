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

## File naming

Each file whose primary export is a `Database.Plugin` (created or
combined) ends in `-plugin.ts` — e.g. `node-plugin.ts`, `model-plugin.ts`,
`pbr-core-plugin.ts`. The exported constant itself keeps its short
concept name (`node`, `model`, `pbrCore`) so import sites stay terse.

The suffix is for discovery: cursor rules, codebase grep, and "find all
plugins" tooling can match `**/*-plugin.ts` without inspecting
contents. It also disambiguates plugin from type when a folder holds
both (`camera/camera.ts` is the type; `camera/camera-plugin.ts` is the
plugin).

Files with helper exports, value types, schemas, or shaders do **not**
take the suffix — only plugin files.

## Shared conventions

- **Uppercase identifier** = archetype. **Lowercase** = component or
  resource. Disambiguated by where declared (archetype vs. component vs.
  resource section of the data plugin).
- **Entity references** are typed `EntityId`; field names drop the `Ref`
  suffix — the type carries the signal.
- **Implementation prefixes** (`pbr`, `ibl`, …) belong in code where they
  disambiguate cross-plugin reuse. Drop them in the conceptual view.
- **`_` prefix** = ephemeral / derived / not part of the data model.
  Applies to **components, archetypes, and resources** in code — the
  prefix makes "this is system-owned, not user-authored" visible at every
  read site. The human ignores it when modelling; system-graph views
  still display it. Does **not** apply to plugin names, system names, or
  transactions — those are grouped by feature folder, and the folder
  already communicates whether a plugin is authored surface or
  implementation.
- **Inline `: Type`** only on `_`-prefixed names. Persistent items get
  their type from the data plugin where they're declared.
- **Components use JSON schemas**, resources use `{ default: X as T }`.
  Schemas (e.g. `Entity.schema`, `Mat4x4.schema`, `Boolean.schema`,
  `{ type: "string" }`) enable typed-buffer column storage — the right
  choice when a value is stored once per entity. Resources are a single
  slot per database, so the runtime cost of typed storage isn't worth
  it; the default-pattern is the convention there. Use the default
  pattern on components *only* for runtime-only objects (GPU buffers,
  bind groups, closures, complex JS objects with no schema).

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
