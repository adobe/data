---
paths:
  - "**/component.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- The file exports the key alone: a top-level `Symbol()` constant, its traits declared beside it in `declare module "@adobe/ecs" { interface Components { ... } }`.
- Treat its value as immutable, changed by row assignment or `commands`: an object or array value is `readonly` throughout and replaced, since a change in place goes unseen. A handle to what's outside the world, such as an element, is mutable by nature; keep the state that matters in the world.
- A key is a top-level `Symbol()` with no description, its traits declared beside it: `declare module "@adobe/ecs" { interface Components { [title]: { type: string } } }`.
- An entity reference is a component of its own, `type: Entity` with `reference: "owner"` or `"weak"`, never a field of a struct. A DOM object is `thread: "main"`.
- A derived component, `derived: true`, is defined in its own file by `Component.derive(key, { from, not })`: it's on exactly the entities some derivation of it matches, and nothing else adds or removes it.
