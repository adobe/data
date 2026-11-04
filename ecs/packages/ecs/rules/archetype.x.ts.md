---
glob: "**/archetype.*.ts"
---
- `export const Todo = [title, done] as const`: the components an entity spawns with, `commands.spawn(Todo)({ ... })`, and a query's `with: [...Todo]`.
