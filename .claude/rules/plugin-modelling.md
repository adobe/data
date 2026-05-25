---
paths:
  - '**/*plugin*'
  - '**/*plugin*/**'
---

# Plugin modelling — model vs. system, authored vs. derived

Two orthogonal questions to ask of every plugin:

1. **What in this plugin is *authored* — state the user writes / inserts /
   sets?**
2. **What in this plugin is *derived* — state a system produces from other
   state?**

The human architect designs the authored surface. Systems and derived state
are implementation: the AI owns them. When discussing or sketching a plugin,
**show only the authored surface unless explicitly asked about behaviour.**

## Two tiers of model plugins

There is a small **core model** the primary consumers of the domain read,
plus an open set of **authoring abstractions** that systems expand into
core model state.

- **Core:** the primary record types of the domain. Fixed and small —
  every consumer reads them.
- **Authoring abstractions:** higher-level intents the user prefers to
  write. Open-ended; a system translates each into core state.

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
  composes another. `Reply: [parent, ...Message]` reads instantly as
  "a Reply is a Message plus a parent."
- **Use `EntityId` for entity references**, not `number`. Drop the `Ref`
  suffix on the field name — the type column already conveys "this is a
  reference." Write `author: EntityId`, not `authorRef: number`.
- **Drop implementation prefixes** from field names in the conceptual
  model. Prefixes may stay in code where the same name lives across
  plugins, but they don't belong in the user's mental model.
- **Skip derived components, derived resources, and systems.** They are
  not part of the authored surface. If a system writes back onto a
  user-facing archetype, omit it here and document it separately as an
  output of the relevant system.
- **One line per field.** Types may include unions and `null` where the
  field is optional. Trailing `// { ... }` shape comments stay on the same
  line as the field; do not wrap them, even when long.

## Worked example

A chat domain — generic and concrete enough to show every element of the
format:

```
chatCore = combine(user, channel, message)

user
  components
    name:   string
    email:  string
  archetypes
    User: [name, email]

channel
  components
    name:       string
    createdBy:  EntityId
  archetypes
    Channel: [name, createdBy]

message
  components
    text:    string
    author:  EntityId
    channel: EntityId
    sentAt:  timestamp
    parent:  EntityId         // used only by Reply
  resources
    activeChannel: EntityId
  archetypes
    Message: [text, author, channel, sentAt]
    Reply:   [parent, ...Message]
```

The authored surface of the entire domain core is 11 component fields,
1 resource, and 4 archetypes. Anything that ranks the feed, delivers
notifications, indexes search, syncs with a peer, or renders the UI is
implementation and does not appear here.

## When designing or discussing a new plugin

1. Write the authored surface in this format **first**.
2. Then describe the system(s) that read/write it as a separate I/O
   contract — "reads X, writes Y."
3. Mark derived components on user-facing archetypes explicitly so the
   reader knows they're system-written, not user-authored.
4. Keep the user's mental model to the union of the authored surfaces.
   The system tier expands as needed without changing it.
