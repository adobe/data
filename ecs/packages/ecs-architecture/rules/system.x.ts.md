---
glob: "**/system.*.ts"
---
- Export it typed as its interface: `export const name: System = System.create(...)`, with type arguments only for input and result (`System<{ readonly amount: number }, Entity>`, `void` for no input).
- The world reaches it only if something lists it: the layer's `systems` in `constant.systems.ts`, a composite, or `world.run`/`world.add`. A system only `systems` reaches stays private (in `systems/`); export one others run or order against.
- A model system never names a view system: put the `before`/`after` on the view system, or order both against a phase.
