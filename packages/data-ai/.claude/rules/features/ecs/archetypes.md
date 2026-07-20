---
paths:
  - '**/features/*/ecs/**/archetypes/**/*.ts'
---

# ecs/archetypes/ — a named set of components

Archetypes live in **`session-database/archetypes/`**, not with the persistent
schema: an archetype is a physical packing layout for efficient iteration, a
convenience for the running app — not part of the serialized data model. The
session database (which `extends` persistent) is therefore where they register.

An archetype is an `UpperCase` `const`: an ordered list of component keys,
`as const satisfies Array<keyof typeof components>`. Import the keys from the
component barrels so they are checked against real components. A persistent-only
archetype reads the persistent barrel; one that also packs a transient column
(e.g. a live `dragPosition` slot) spans **both** sets, so merge them:

```ts
// persistent columns only
import * as components from "../../persistent-database/components/index.js";

export const Thing = ["alpha", "beta"]
    as const satisfies Array<keyof typeof components>;
```

```ts
// spans persistent + session columns
import * as persistentComponents from "../../persistent-database/components/index.js";
import * as sessionComponents from "../components/index.js";
const components = { ...persistentComponents, ...sessionComponents };

export const Todo = ["todo", "order", "dragPosition"]
    as const satisfies Array<keyof typeof components>;
```

Reuse shape by spreading one archetype into another:

```ts
export const Bigger = [...Thing, "gamma"]
    as const satisfies Array<keyof typeof components>;
```

`UpperCase` because an archetype names a *shape* — a kind of entity — the
way a class name does. Iterating archetype **rows** at runtime is a
separate concern; see the rules-root `archetypes.md`.

## Drift guard against the data-type

An archetype that has a corresponding `data/` type (the shape of one row)
carries a **non-exported** compile-time check: infer the row shape from
the archetype and assert it equals that data-type, so the two can't drift
apart. The data-type stays the single source of truth; the archetype is
checked against it.

```ts
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { Thing } from "../../../data/thing/thing.js";

// non-exported — fails to compile if components/keys and `Thing` diverge
const _archetypeSchema = Schema.fromArchetype(components, Thing);
type _Check = Assert<Equal<Schema.ToType<typeof _archetypeSchema>, Thing>>;
```

(Confirm the exact row-type extraction against the current `Schema` API on
first use — a `Database.Archetype.RowOf`-style helper may read cleaner.)

An `index.ts` barrel re-exports every archetype; it feeds the `archetypes`
facet on `session-database.ts`.
