---
name: build-services
description: Build a feature's services/ layer — async capability contracts (ports to the outside world). Optional.
input: feature
output: feature
---

Skip if this feature doesn't contain or require services.

Create the feature's `services/` layer: one `<name>-service/` namespace folder per async
contract — an `interface` (validated with `AsyncDataService.IsValid`), async-only members,
and `create*` factories.

Only if the feature talks to the outside world. Comes after `data/`, before `services/main-service/`.

The how is in the auto-loading `features/services/index.md` rule (and `global/namespace.md`).
