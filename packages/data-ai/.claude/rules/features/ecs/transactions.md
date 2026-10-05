---
paths:
  - '**/features/*/ecs/transactions/**/*.ts'
---

# ecs/transactions/ — atomic mutations

One mutation per file: a function taking the transaction store and Data args,
returning `void`. All its writes commit or roll back together.

```ts
export const toggleComplete = (t: CoreDatabase.Store, { id }: { readonly id: Entity }) => {
  const row = t.read(id, t.archetypes.Todo);
  if (row === null) return;               // not a todo: no-op, as the spec says
  t.update(id, { complete: !row.complete });
};
```

- **Type the store** `CoreDatabase.Store`, or `IndexDatabase.Store` once it reads an
  index.
- **Validate and silently return** on illegal input rather than throwing, so replays
  under sync stay idempotent.
- **Guard by entity kind.** `t.read(id)` returns any entity. Check the entity is the
  kind the op expects (`t.read(id, t.archetypes.Todo)`, or its tag) before writing, or
  an id naming another kind gets written to.
- **Decisions come from `data/values/` helpers**; the transaction reads the touched
  slice, applies the helper, and writes the result.
- **Transactions are an implementation detail.** Conformance checks the action that
  calls them (`actions.md`), so a transaction needs no spec op of its own. Give one a
  unit test only when it has logic no action covers.
- **The barrel re-exports only mutations.** A read helper shared by several
  transactions (`readBoard`) lives beside them, outside the barrel.
