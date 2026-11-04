---
applyTo: "**/archetype.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- An archetype is a type, so its name is PascalCase: `export const Todo = [title, done] as const`, in `archetype.todo.ts`.
- `export const Todo = [title, done] as const`: the components an entity spawns with, `commands.spawn(Todo)({ ... })`, and a query's `with: [...Todo]`.
