# Rules

Distributable Claude project rules for data-oriented architecture. Copy or
symlink this directory into your project's `.claude/rules/` layout; Claude
discovers `.md` files recursively and, for rules carrying a `paths:`
frontmatter glob, injects them only when a matching file is in context.

## Layout mirrors the feature-folder structure

The `structure/` subtree mirrors the four feature layers one-to-one, so the
guidance for a folder lives at the same path shape as the code it governs. A
folder's own `index.md` holds just enough to understand that folder; each
child gets its own file (recursing wherever the source tree does):

```
structure/
  index.md            # the feature layering as a whole (ui → ecs → services → data)
  data/
    index.md          # data-type namespaces (foundation)
    state.md          # the State aggregate: pure transforms & derivations
  services/index.md   # service interfaces + service types
  ecs/
    index.md          # the ECS layer + layered database plugins
    components.md  resources.md  archetypes.md
    computed.md  indexes.md  transactions.md  services.md  actions.md
  ui/index.md         # UI (points to element / presentation / lazy-element file rules)
```

Each rule's `paths:` glob scopes it to the matching source files, so editing
`ecs/components/foo.ts` pulls in both `ecs/index.md` (the layer overview) and
`ecs/components.md` (the specifics) — at creation and at every later edit.
