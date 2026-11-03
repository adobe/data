---
applyTo: "**/resource.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- The file exports the key alone: a top-level `Symbol()` constant, its traits declared beside it in `declare module "@adobe/ecs" { interface Resources { ... } }`.
- A key is a top-level `Symbol()` with no description, its traits declared beside it: `declare module "@adobe/ecs" { interface Resources { [filter]: { type: Filter; default: "all" } } }`.
- A resource a system waits for is typed `T | null` and read with `resources: { is: [key] }`. A DOM object is `thread: "main"`.
