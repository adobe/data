---
paths:
  - "**/system.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- Export it typed as its interface: `export const name: System = System.create(...)`, with type arguments only for input and result (`System<{ readonly amount: number }, Entity>`, `void` for no input).
- The world reaches it only if something lists it: the layer's `systems` in `constant.systems.ts`, a composite, or `world.run`/`world.add`. A system only `systems` reaches stays private (in `systems/`); export one others run or order against.
- A model system never names a view system: put the `before`/`after` on the view system, or order both against a phase.
- Read entities with a query (`components: { with, not }`). Define an `Index` only to look up by key, or to read a set from inside another system's body: every structural change updates it.
- A system that only reads is `readonly: true`; `changed: [x]` skips rows whose `x` didn't change, `resources: { is: [r] }` waits for a resource.
- Spawn, despawn, add and remove through `commands`; they apply at the next sync point. Order systems with `before`, `after` and `during`, never by list position.
- A row body allocates nothing: no closures, arrays or objects per row.
