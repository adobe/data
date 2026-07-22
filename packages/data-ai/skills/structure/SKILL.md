---
name: structure
description: Use when scaffolding a whole feature — the bottom-up build order and which build-* phase skill drives each layer.
---

A feature is layered `ui → ecs → services → data` (higher imports lower, never the
reverse). Build **bottom-up**, one phase at a time, doing only the layers the feature
needs. Each phase has a `build-*` skill that scaffolds it; the `features/` rules
auto-load by path and cover the *how*.

1. **`build-data`** — data-type namespaces + the `data/state/` spec. *(always)*
2. **`build-services`** — async capability contracts. *(if it talks to the outside world)*
3. **`build-core-database`** — the ecs schema: components / resources / archetypes. *(always, for stateful features)*
4. **`build-indexes`** — indexed lookups. *(as needed)*
5. **`build-transactions`** — atomic mutations.
6. **`build-computed`** — derived observables.
7. **`build-service-database`** — db-bound service factories. *(if any)*
8. **`build-actions`** — async orchestration. *(if any)*
9. **`build-ui`** — presentation.

Every source file lives in a `features/<name>/` folder (features may nest). Start from
`features/index.md` for the layering and the spec/implementation relationship. Worked
examples: the `data-lit-todo` and `data-lit-tictactoe` sample features.
