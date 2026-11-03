---
applyTo: "**/element.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- An element knows nothing of the ECS: no `@adobe/*` import. It takes properties and dispatches DOM events; the feature's view binds it to the world.
