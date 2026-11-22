---
glob: "**/component.*.ts"
---
- The file exports the key alone: a top-level `Symbol()` constant, its traits declared beside it in `declare module "@adobe/ecs" { interface Components { ... } }`.
- Treat its value as immutable, changed by row assignment or `commands`: an object or array value is `readonly` throughout and replaced, since a change in place goes unseen. A handle to what's outside the world, such as an element, is mutable by nature; keep the state that matters in the world.
