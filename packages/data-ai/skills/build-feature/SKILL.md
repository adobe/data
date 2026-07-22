---
name: build-feature
description: Build a complete feature by composing the per-layer build-* skills bottom-up. Use to scaffold or extend one feature.
---

Build a `features/<name>/` feature **bottom-up**, invoking each layer's skill in turn.
Do only the layers the feature needs:

1. `build-data` — data types + `State` spec. *(always)*
2. `build-services` — async contracts. *(if it talks to the outside world)*
3. `build-core-database` — the ecs schema. *(always, for stateful features)*
4. `build-indexes` — indexed lookups. *(as needed)*
5. `build-transactions` — atomic mutations.
6. `build-computed` — derived observables.
7. `build-service-database` — db-bound service factories. *(if any)*
8. `build-actions` — async orchestration. *(if any)*
9. `build-ui` — presentation.

Each `build-*` defers its authoring detail to the auto-loading `features/` rule.
See `structure` for the layer shape.
