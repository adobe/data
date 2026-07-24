---
paths:
  - '**/features/*/ecs/**/actions/**/*.ts'
---

# ecs/actions/ — async orchestration

One action per file: a function taking the **whole database** as its first
argument and pure `data/` args. Actions orchestrate anything *outside* a
single transaction — awaiting a `services/` port, sequencing calls, deriving
timing — and then commit the result through a transaction.

```ts
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const addRandomTodo = async (db: ServiceDatabase) => {
    const name = await db.services.nameGenerator.generateName(); // await a services/ port
    db.transactions.createTodo({ name });                        // then exactly one commit
};
```

- Type the `db` parameter on the lowest database layer exposing what the
  action touches — usually `ServiceDatabase` (services **and**
  transactions). Never the action layer itself (that would be a cycle).
- **Call at most one transaction** per action, so undo/redo stays one step
  per operation.
- **Fire-and-forget.** An action's return value is not consumed; results flow
  back through observables. `db.services.*` calls are `void` or
  awaited-internally, never surfaced to the caller.
- Do the outside-world work here: await/sequence `services/` calls, and if a
  slow call needs timing, compute it here around the call.
- An `index.ts` barrel feeds the `actions` plugin facet.
