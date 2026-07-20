---
paths:
  - '**/features/*/ecs/**/actions/**/*.ts'
---

# ecs/actions/ — async orchestration

One action per file: a function taking the **whole database** as its first
argument and pure `data/` args. Actions are the seam where the UI reaches
anything *outside* a single transaction — awaiting a `services/` port,
sequencing calls, deriving timing — and then committing the result.

```ts
import type { ServiceDatabase } from "../service-database.js";

export const addRandomTodo = async (db: ServiceDatabase) => {
    const start = performance.now();
    db.services.todoAnalytics.record("addRandomTodo.start");
    const name = await db.services.nameGenerator.generateName();
    db.transactions.createTodo({ name });               // exactly one commit
    db.services.todoAnalytics.record("addRandomTodo.end", {
        durationMs: Math.round(performance.now() - start),
    });
};
```

- Type the `db` parameter on the lowest database layer exposing what the
  action touches — usually `ServiceDatabase` (services **and**
  transactions). Never the action layer itself (that would be a cycle).
- **Call at most one transaction** per action, so undo/redo stays one step
  per user gesture.
- **Fire-and-forget.** The UI never consumes an action's return value; state
  flows back through observables. `db.services.*` calls are `void` /
  awaited-internally, never surfaced to the caller.
- Bracket a slow service call with analytics start/end (or similar) when you
  need to measure it; the timing math lives here, not in the UI.
- The UI calls `db.actions.*` for discrete user gestures rather than
  `db.transactions.*` directly. A continuous manipulation (drag, slider) may
  still bind the transaction directly — it is not a discrete event.
- An `index.ts` barrel feeds the `actions` plugin facet.
