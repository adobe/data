---
paths:
  - '**/features/*/ecs/computed/**/*.ts'
---

# ecs/computed/ — derived observable values

One derived value per file: a `cached` function of a database layer returning an
`Observe`. Each spec derivation conforms against the computed of the same name.

```ts
export const status = cached((db: IndexDatabase) =>
  Observe.withFilter(db.observe.resources.board, BoardState.deriveStatus),
);
```

- **Wire `data/values/` helpers** to the minimal observables they read. The spec
  derivation calls the same helper, so the two agree by construction. Never import
  from `spec/`.
- **Observe every input.** A computed that reads two resources must observe both, or
  it goes stale when only one changes.
- **Performance picks the wiring.** Hand-wire minimal resource or index reads on hot
  or large paths. For "how many" use `db.observe.count(components, { where })`, not a
  selected array's `.length`.
- **An entity-list computed emits ids.** Name it in the implementation's `hydrate`, so
  conformance maps each id through `toData`.
- A computed with no spec derivation (one helper applied to one field) is covered by
  that helper's unit test.
- **Type `db` on the lowest layer** that exposes what it reads. Computeds are not
  available inside service factories while services are being built, so a factory
  calls the computed function directly with its `db`.
- The `index.ts` barrel feeds the `computed` facet.
