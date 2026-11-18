---
glob: "**/system.*.ts"
---
- Export it typed as its interface: `export const name: System = System.create(...)`, with type arguments only for input and result (`System<{ readonly amount: number }, Entity>`, `void` for no input).
- The world reaches it only if something in the source lists it: its layer's plugin's `systems`, a composite, or `world.run`/`world.add`; a test doesn't count. A layer's root holds only systems others add, run or order against; the rest are parts of their plugin, in `plugin.<feature>-<layer>/`, or of a composite, in `system.<name>/`.
- A model system never names a view system: put the `before`/`after` on the view system, or order both against a phase.
- A changes or removed system is typed `System<never>`, which `run` never takes; compose it with the system making what it reacts to.
