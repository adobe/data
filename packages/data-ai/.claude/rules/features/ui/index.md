---
paths:
  - '**/features/*/ui/**/*.ts'
  - '**/features/*/ui/**/*.tsx'
---

# ui/ — user interface

The top layer: UI that binds the feature's `MainService` database (`ecs/main-service.ts`)
to what the user sees. It owns no business logic — it subscribes to state, hands it to
a pure presentation, and wires user input to `service.actions.*`.

Each feature has one base element (Lit: `ui/<feature>-element.ts`, a
`DatabaseElement` typed on its `MainService.plugin`; React: a `use-main-service.ts`
hook) that every element of the feature builds on.

The folder name is framework-neutral; its contents are framework-specific
(Lit elements, React components, …). Each UI unit is its own folder, named
for the concept, exposed through a single lazy wrapper so consumers pay no
bundle cost for what they never render:

```
<name>/
  <name>.ts               # PUBLIC: lazy wrapper — the only external import
  <name>-element.ts       # PRIVATE: the container (subscribe + delegate)
  <name>-presentation.ts  # PRIVATE: pure render(props) function
  <name>.css.ts           # PRIVATE: styles
```

The detailed rules for each file kind (Lit bindings shown; React/Solid
tables inside each):

- `lazy-element.md` — the folder layout and lazy-wrapper mechanics.
- `element.md` — the container discipline (subscribe, callbacks, one
  delegation; no logic).
- `presentation.md` — the pure `render` function.
