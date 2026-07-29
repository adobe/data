# Rules

Distributable Claude project rules for data-oriented architecture. Copy or
symlink this directory into your project's `.claude/rules/` layout; Claude
discovers `.md` files recursively and, for rules carrying a `paths:`
frontmatter glob, injects them only when a matching file is in context.

## Layout mirrors the feature-folder structure

The `features/` subtree mirrors the four feature layers one-to-one, so the
guidance for a folder lives at the same path shape as the code it governs. A
folder's own `index.md` holds just enough to understand that folder; each
child gets its own file (recursing wherever the source tree does):

```
features/
  index.md            # the feature layering as a whole (ui → services → data)
  data/
    index.md          # data-type namespaces (foundation)
    state.md          # the State aggregate: pure transforms & derivations
  services/
    index.md          # the services layer: main-service + capability contracts
    main-service/     # the feature service (ECS implementation)
      index.md        # the service + its layered database plugins
      components.md  resources.md  archetypes.md
      computed.md  indexes.md  transactions.md  services.md  actions.md
      systems.md  conformance.md
  ui/index.md         # UI (points to element / presentation / lazy-element file rules)
```

Alongside `features/`, the rules-root `.md` files hold the **cross-cutting**
patterns the feature rules reference — `namespace.md`, `data-modelling.md`,
`type-casts.md`, `function-references.md`, `cohesion.md`, `archetypes.md` (row
iteration), `plugin-modelling.md`, and the UI file rules (`element.md`,
`lazy-element.md`, `presentation.md`). They live here so the bundle is self-contained; this repo
symlinks them into its own `.claude/rules/` (as it does `features/`).

Each rule's `paths:` glob is scoped to `**/features/*/<layer>/…`, so these
rules apply only once an application opts into the feature-folder pattern
(source organized under `features/<name>/`). Editing
`features/<name>/services/main-service/core-database/components.ts` pulls in both
`main-service/index.md` (the layer overview) and `main-service/components.md`
(the specifics) — at creation and at every later edit.
