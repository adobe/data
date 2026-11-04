---
glob: "**/resource.*.ts"
---
- A key is a top-level `Symbol()` with no description, its traits declared beside it: `declare module "@adobe/ecs" { interface Resources { [filter]: { type: Filter; default: "all" } } }`.
- A resource a system waits for is typed `T | null` and read with `resources: { is: [key] }`. A DOM object is `thread: "main"`.
