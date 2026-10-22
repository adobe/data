---
paths:
  - '**/features/*/data/**/*.ts'
---

# data/ — the feature's pure Data declarations

> **Legacy feature** (has `data/state/` or `services/main-service/`)? Follow `data/state.md` instead.

The foundation layer. Everything here is a declaration about plain, serializable
Data: JSON primitives/arrays/objects plus `ReadonlySet`, `ReadonlyMap`, and `Blob`
(serialize with `Data.stringify` / `Data.parse`). No functions in values, no services,
no ECS machinery. The one exception is a session-scoped resource holding a runtime
handle (a canvas, a live database): `{ default: null as Handle | null, ...Scope.session }`.
It depends only on `@adobe/data` and the `data/` of features this one builds on.

```
data/
  values/<type>/        Data types + pure helpers   (values.md)
  components/<name>.ts  one component schema each   (components.md)
  resources/<name>.ts   one resource schema each    (resources.md)
  entities/<entity>.ts  component-name tuples       (entities.md)
```

Order within `data/`: `values → components / resources → entities`. A value never
imports a component, resource or entity. Where a value helper needs an entity's
fields, it takes them structurally
(`Iterable<{ readonly mark: PlayerMark; readonly cellIndex: CellIndex }>`).

Components and resources share **one namespace** across every feature in an app:
a name is one column or one resource, never both (the store throws on a clash), and
has one owning feature.
