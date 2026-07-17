---
paths:
  - '**/ecs/archetypes/**/*.ts'
---

# ecs/archetypes/ — a named set of components

An archetype is an `UpperCase` `const`: an ordered list of component keys,
`as const satisfies Array<keyof typeof components>`. Import the keys from
the components barrel so they are checked against real components:

```ts
import * as components from "../components/index.js";

export const Thing = ["alpha", "beta"]
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
import type { Thing } from "../../data/thing/thing.js";

// non-exported — fails to compile if components/keys and `Thing` diverge
const _archetypeSchema = Schema.fromArchetype(components, Thing);
type _Check = Assert<Equal<Schema.ToType<typeof _archetypeSchema>, Thing>>;
```

(Confirm the exact row-type extraction against the current `Schema` API on
first use — a `Database.Archetype.RowOf`-style helper may read cleaner.)

An `index.ts` barrel re-exports every archetype; it feeds the `archetypes`
facet on `core-database.ts`.
