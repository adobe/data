---
paths:
  - '**/features/*/services/main-service/**/actions/**/*.ts'
---

# services/main-service/actions/ — async orchestration

One action per file: a function taking the **whole database** as its first
argument and pure `data/` args. Actions orchestrate anything *outside* a
single transaction — awaiting a `services/` port, sequencing calls, deriving
timing — and then commit the result through a transaction.

```ts
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const addRandomTodo = async (service: ServiceDatabase) => {
    const name = await service.services.nameGenerator.generateName(); // await a services/ port
    service.transactions.createTodo({ name });                        // then exactly one commit
};
```

- Type the `service` parameter on the lowest database layer exposing what the
  action touches — usually `ServiceDatabase` (services **and**
  transactions). Never the action layer itself (that would be a cycle).
- **Call at most one transaction** per action, so undo/redo stays one step
  per operation.
- **Fire-and-forget.** An action's return value is not consumed; results flow
  back through observables. `service.services.*` calls are `void` or
  awaited-internally, never surfaced to the caller.
- Do the outside-world work here: await/sequence `services/` calls, and if a
  slow call needs timing, compute it here around the call.
- An `index.ts` barrel feeds the `actions` plugin facet.
