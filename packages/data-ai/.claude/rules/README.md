# Rules

Distributable Claude project rules for data-oriented architecture. Copy or
symlink this directory into your project's `.claude/rules/` layout; Claude
discovers `.md` files recursively and, for rules carrying a `paths:`
frontmatter glob, injects them only when a matching file is in context.

## Layout mirrors the feature-folder structure

The `features/` subtree mirrors a feature's layers one-to-one, so the guidance for a
folder lives at the same path shape as the code it governs. A folder's `index.md`
holds just enough to understand that folder; each child gets its own file:

```
global/               # always-on conventions — deliberately repo-wide globs
  namespace.md  cohesion.md  type-casts.md  function-references.md  react.md
features/
  index.md            # the layering as a whole: data → services → spec | ecs → ui → app
  data/
    index.md          # pure Data declarations
    values.md  components.md  resources.md  entities.md
  services/index.md   # service namespaces: interface, create, createFake
  spec/index.md       # the State spec: actions, derivations, cases (test tier)
  ecs/
    index.md          # the layered database plugins + MainService
    core.md  indexes.md  transactions.md  computed.md  services.md  actions.md
    systems.md  conformance.md
  ui/                 # element / presentation / lazy-wrapper rules
app.md                # src/app/: the composition root
```

The `global/` rules are **intentionally repo-wide** — their `paths:` globs (`**/*.ts`
etc.) apply everywhere, by design. Alongside `features/`, the remaining rules-root
`.md` files hold **cross-cutting** patterns the feature rules reference —
`app.md`, `data-modelling.md`, `archetypes.md` (the query and iteration model),
`plugin-modelling.md`, `versioning.md`, and the UI rules `element.md` and
`lazy-element.md` (`features/ui/` holds `presentation.md` and the binding-element and
lazy-wrapper rules). They live here so the bundle is
self-contained; this repo symlinks them into its own `.claude/rules/`.

Each feature rule's `paths:` glob is scoped to `**/features/*/<layer>/…`, so these
rules apply once an application organizes its source under `features/<name>/`.
Editing `features/<name>/data/components/name.ts` pulls in both `data/index.md` and
`data/components.md` — at creation and at every later edit.
