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
`pbr-core-plugin.ts`. The suffix is for discovery: cursor rules,
codebase grep, and "find all plugins" tooling match `**/*-plugin.ts`
without inspecting contents.

The exported constant's name depends on whether the folder also hosts a
type namespace:

- **Pure-plugin folder** (no owned type) → export the concept name
  itself, lowercase. `node-plugin.ts` exports `node`. Import sites read
  `import { node } from "..."; Database.Plugin.combine(node, ...)`.
- **Type + plugin folder** (folder hosts both an owned type and its
  plugin) → the plugin file exports `plugin`, re-exported through the
  type's namespace. `camera-plugin.ts` exports `plugin`; `camera/public.ts`
  re-exports it; consumers reach it as `Camera.plugin`. One import gives
  both the type and the plugin.

Files with helper exports, value types, schemas, or shaders do **not**
take the suffix — only plugin files.

## Resources and archetypes as types

Prefer **one resource per plugin**, of an owned type that the folder also
hosts. `light/` has one `light` resource of type `Light`; `orbit/` has
one `orbit` resource of type `Orbit`. Splitting a single coherent
concept into siblings (`lightDirection`, `lightColor`, `ambientStrength`)
duplicates the concept's identity at every read site.

For each **archetype** the plugin declares, add a TypeScript type with
the same name describing one row's authored shape. `Node` is the type
for the `Node` archetype's row. The components stay separate per
typed-buffer-column convention; the type names the bundle so consumers
can declare `const node: Node` after a read.

Both cases follow the same folder shape:

```
<concept>/
  <concept>.ts          # type + namespace
  public.ts             # re-exports plugin (and any helpers)
  <concept>-plugin.ts   # exports `plugin`
```

Consumers reach the plugin as `Concept.plugin` and the type as
`Concept`. Pure-plugin folders (no owned type) still export their
plugin under a lowercase concept name — see "File naming" below.

**Exceptions:**
- Plugins whose resources have genuinely independent lifecycles
  (`graphics` — `device`, `canvas`, `commandEncoder`, each set at
  different times) keep them as separate resources. Consolidating
  would force any one write to replace the whole struct.
- Ephemeral implementation archetypes (e.g. `_PbrPrimitive`,
  `_VisibleMaterial`) don't need a value type — consumers iterate
  them by archetype, never construct one.

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
