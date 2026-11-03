---
glob: "**/element.*.ts"
---
- An element knows nothing of the ECS: no `@adobe/*` import. It takes properties and dispatches DOM events; the feature's view binds it to the world.
