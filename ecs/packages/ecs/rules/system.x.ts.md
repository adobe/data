---
glob: "**/system.*.ts"
---
- Read entities with a query (`components: { with, not }`). Define an `Index` only to look up by key, or to read a set from inside another system's body: every structural change updates it.
- A system that only reads is `readonly: true`; `changed: [x]` skips rows whose `x` didn't change, `resources: { is: [r] }` waits for a resource.
- Spawn, despawn, add and remove through `commands`; they apply at the next sync point. Order systems with `before`, `after` and `during`, never by list position.
- A row body allocates nothing: no closures, arrays or objects per row.
