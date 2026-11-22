---
applyTo: "**/system.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- Export it typed as its interface: `export const name: System = System.create(...)`, with type arguments only for input and result (`System<{ readonly amount: number }, Entity>`, `void` for no input).
- The world reaches it only if something in the source lists it: its layer's plugin's `systems`, a composite, or `world.run`/`world.add`; a test doesn't count. A layer's root holds only systems others add, run or order against; the rest are parts of their plugin, in `plugin.<feature>-<layer>/`, or of a composite, in `system.<name>/`.
- A model system never names a view system: put the `before`/`after` on the view system, or order both against a phase.
- A changes or removed system is typed `System<never>`, which `run` never takes; compose it with the system making what it reacts to.
- Prefer pure functions and immutable values: change a component or resource by assigning a new value rather than changing an object or array read from one in place, which change filters can't see; handles, such as elements, are the usual exception. Small values are cheap to replace, and the compiler avoids allocating where it can, so mutate for speed only where a benchmark shows the need.
- Read entities with a query (`components: { with, not }`). Define an `Index` only to look up by key, or to read a set from inside another system's body: every structural change updates it.
- A system that only reads is `readonly: true`; `changed: [x]` skips rows whose `x` didn't change, `resources: { is: [r] }` waits for a resource.
- Spawn, despawn, add and remove through `commands`; they apply at the next sync point. Order systems with `before`, `after` and `during`, never by list position.
- A row body allocates nothing: no closures, arrays or objects per row.
- `System.removed` releases what a component holds when it goes, its entity despawns, the system is removed or the world is disposed; `System.changes` sees each sync point's change set through `changes.previous` and `changes.next`. Both run only while added: list a release beside what creates it, in one `systems` list or composite. `run` takes neither.
