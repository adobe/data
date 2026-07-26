---
paths:
  - '**/*.tsx'
---

# React component authoring

React components live in the `components/` layer. Consume Observe and void actions from plugins. Use `@adobe/data-react` for `useDatabase`,
`useObservableValues`, and `DatabaseProvider`.

---

## useDatabase — single context

Binding components **must** call `useDatabase` to obtain the main service context. Do **not** access any other React context. Additional
contexts create a context waterfall and hurt performance. All other services and state are reachable from the database.

---

## Binding component vs presentation

**Binding component** — the React component that:

- Injects observed values via `useObservableValues`
- Triggers re-render when those values change
- Binds action callbacks to the presentation

**Presentation** — a pure function (no hooks) that receives data and action callbacks as props and returns JSX. Keep reactive logic in the
binding component; presentation stays pure.

---

## Props from parent

**Do not** pass values from parent except when needed to identify which entity in the database to bind to.

```tsx
// Parent: passes entity so child knows which record to bind to
{
  values.sprites.map(entity => <Sprite key={entity} entity={entity} />);
}

// Child: uses entity prop to observe the right record
function Sprite({ entity }: { entity: Entity }) {
  const db = useDatabase();
  const values = useObservableValues(() => ({ sprite: db.observe.entity(entity, db.archetypes.Sprite) }), [entity]);
}
```

---

## useObservableValues

_Most_ binding components use a **single** `useObservableValues` call. Collect all observed values in one object. Use `Observe.withDefault`
for values that may resolve slowly.

```tsx
function Counter() {
  const db = useDatabase(counterPlugin);
  const values = useObservableValues(() => ({
    count: db.observe.resources.count,
  }));
  if (!values) return null;
  return presentation.render({ ...values, increment: db.transactions.increment });
}
```

---

## Presentation exports

Presentation files ONLY export `render` (and localization bundles where appropriate). Nothing else. If you need render args type externally,
use `Parameters<typeof render>[0]`.

---

## Action callbacks (not events)

Use **verb** or **verbNoun** names — never `on*` prefix. See `.claude/rules/presentation.md` for full examples.

**Pass function references directly** when the signature matches; wrap in an arrow function only to supply arguments:

```tsx
increment: db.transactions.increment; // reference — no wrapper needed
toggleSprite: () => db.transactions.toggleSpriteActive({ entity }); // args required — wrap
```

---

## Execute

When creating or modifying a React component:

1. Call `useDatabase` for the main service context. Do not use any other React context.
2. Split into binding component (reactive) and presentation (pure).
3. Use a single `useObservableValues` in the binding component.
4. Pass observed values and action callbacks to presentation. Pass function references directly when the signature matches; wrap only when
   supplying arguments.
5. Keep presentation pure — no hooks.
6. Presentation exports only `render` (and localization bundles where appropriate).
7. Add `*-presentation.test.tsx` for presentation when appropriate; do not unit test binding components.
8. Never include business logic within binding components. Move into computed values or action handlers.
