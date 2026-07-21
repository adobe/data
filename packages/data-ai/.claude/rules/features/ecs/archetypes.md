---
paths:
  - '**/features/*/ecs/**/archetypes/**/*.ts'
---

# ecs/archetypes/ — a named set of components

Archetypes live in their own **`archetype-database/archetypes/`** layer, not in
any scope layer: an archetype is a physical packing layout for efficient
iteration — a convenience for the running app, not part of the serialized data
model. `archetype-database` `extends` the topmost scope layer the feature
defines, so an archetype may reference components from any scope.

An archetype is an `UpperCase` `const`: an ordered list of component keys,
`as const satisfies Array<keyof typeof components>`. Import the keys from the
scope component barrels so they are checked against real components. A
document-only archetype reads the document barrel; one that also packs a column
from another scope (e.g. a live `dragPosition` slot from `session`) spans
**both** sets, so merge them:

```ts
// document columns only
import * as components from "../../document-database/components/index.js";

export const Thing = ["alpha", "beta"]
    as const satisfies Array<keyof typeof components>;
```

```ts
// spans document + session columns
import * as documentComponents from "../../document-database/components/index.js";
import * as sessionComponents from "../../session-database/components/index.js";
const components = { ...documentComponents, ...sessionComponents };

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
facet on `archetype-database.ts`.
