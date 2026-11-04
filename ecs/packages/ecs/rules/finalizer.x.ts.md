---
glob: "**/finalizer.*.ts"
---
- `Finalizer.create` releases what a component holds when the component goes, an entity despawns or the world is disposed. `Finalizer.changes` sees each change set, through `changes.previous` and `changes.next`.
