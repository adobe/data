---
applyTo: "**/component.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- The file exports the key alone: a top-level `Symbol()` constant, its traits declared beside it in `declare module "@adobe/ecs" { interface Components { ... } }`.
- A key is a top-level `Symbol()` with no description, its traits declared beside it: `declare module "@adobe/ecs" { interface Components { [title]: { type: string } } }`.
- An entity reference is a component of its own, `type: Entity` with `reference: "owner"` or `"weak"`, never a field of a struct. A DOM object is `thread: "main"`.
