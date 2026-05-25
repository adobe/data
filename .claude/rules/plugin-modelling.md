---
paths:
  - 'packages/**/plugins/**'
  - 'packages/**/*-plugin.ts'
  - 'packages/**/*-service.ts'
---

# Plugin modelling — model vs. system, authored vs. derived

Two orthogonal questions to ask of every plugin:

1. **What in this plugin is *authored* — state the user writes/inserts/sets?**
2. **What in this plugin is *derived* — state a system produces from other
   state?**

The human architect designs the authored surface. Systems and derived state
are implementation: the AI owns them. When discussing or sketching a plugin,
**show only the authored surface unless explicitly asked about behaviour.**

## Two tiers of model plugins

There is a small **core model** every renderer needs, plus an open set of
**authoring abstractions** that systems expand into core model state.

- **Core:** node, camera, light, model+geometry. These are the universal
  vocabulary of "what the world contains."
- **Authoring abstractions:** orbit (writes camera), procedural shape
  (writes model+geometry), animation clip+player (writes any component),
  particle emitter, constraint, state machine, ... Open-ended; each
  project picks the ones it needs.

The same plugin almost never contains both authored and derived data the
user cares about. If it appears to, the derived data is the *implementation*
of the authoring abstraction.

## Concise visualisation format

When sketching a plugin, draw only the authored surface. Use this layout:

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

### Rules for the format

- **One indent level per nesting.** No noise lines, no blank rows.
- **Reuse via `...Other`** in archetype lists when the new archetype
  composes another. `Model: [geometry, ...Node]` reads instantly as
  "a Model is a Node plus a geometry."
- **Use `EntityId` for entity references**, not `number`. Drop the `Ref`
  suffix on the field name — the type column already conveys "this is a
  reference." Write `geometry: EntityId`, not `geometryRef: number`.
- **Drop implementation prefixes** (`pbr`, `ibl`, etc.) when writing the
  conceptual model — `environmentUrl`, not `iblEnvironmentUrl`. The
  prefix may stay in code where the same name lives across plugins, but
  it doesn't belong in the user's mental model.
- **Skip derived components, derived resources, and systems.** They are
  not part of the authored surface. If a system writes back onto a
  user-facing archetype (e.g. `animationSkeletonRef` on `Model`), omit it
  here and document it separately as an output of the relevant system.
- **One line per field.** Types may include unions and `null` where the
  field is optional.

## Worked example: corePlugin

```
corePlugin = combine(node, camera, light, model)

node
  components
    position:  Vec3
    rotation:  Quat
    scale:     Vec3
    parent:    EntityId       // 0 = root
    visible:   boolean
  archetypes
    Node: [position, rotation, scale, parent, visible]

camera
  resources
    camera: Camera            // { position, target, up, fieldOfView,
                              //   nearPlane, farPlane, aspect, orthographic }

light
  resources
    lightDirection:   Vec3
    lightColor:       Vec3
    ambientStrength:  F32
    environmentUrl:   string | null

model
  components
    modelUrl:  string         // on Geometry
    geometry:  EntityId       // on Model
  archetypes
    Geometry: [modelUrl]
    Model:    [geometry, ...Node]
```

That's the whole authored surface of a renderable scene: 20 fields, 1 struct
resource, 4 scalar resources, 2 archetypes. Anything that loads, transforms,
animates, skins, or renders is implementation and does not appear here.

## When discussing or designing a new plugin

1. Write the authored surface in this format **first**.
2. Then describe the system(s) that read/write it, as a separate I/O
   contract — "reads X, writes Y to GPU / to component Z / each frame."
3. Mark derived components on user-facing archetypes explicitly so the
   reader knows they're system-written, not user-authored.
4. Keep the human's view of the world to the union of the authored
   surfaces. The system tier expands as needed without changing it.
