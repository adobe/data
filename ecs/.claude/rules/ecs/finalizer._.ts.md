---
paths:
  - "**/finalizer.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- `Finalizer.create` releases what a component holds when the component goes, an entity despawns or the world is disposed. `Finalizer.changes` sees each change set, through `changes.previous` and `changes.next`.
