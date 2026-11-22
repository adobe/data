---
glob: "**/resource.*.ts"
---
- The file exports the key alone: a top-level `Symbol()` constant, its traits declared beside it in `declare module "@adobe/ecs" { interface Resources { ... } }`.
- Treat its value as immutable, `readonly` throughout, and change it by assigning a new one, `resources[key] = next`, when it differs: that's what `changed: [key]` sees, and a change in place goes unseen.
- A handle to what's outside the world, such as an element, canvas or GPU device, is mutable by nature; keep the state that matters in the world, and write it to the handle.
- Mutate for performance only where a benchmark shows the need, keeping it private to the system, or the few closely related systems or the feature, that use it.
