---
glob: "**/component.*.ts"
---
- A key is a top-level `Symbol()` with no description, its traits declared beside it: `declare module "@adobe/ecs" { interface Components { [title]: { type: string } } }`.
- An entity reference is a component of its own, `type: Entity` with `reference: "owner"` or `"weak"`, never a field of a struct. A DOM object is `thread: "main"`.
- A derived component, `derived: true`, is defined in its own file by `Component.derive(key, { from, not })`: it's on exactly the entities some derivation of it matches, and nothing else adds or removes it.
