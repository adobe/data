---
paths:
  - '**/features/*/ecs/actions/**/*.ts'
---

# ecs/actions/ — the operations the app performs

One action per file: a function taking the whole database and Data args. Actions are
the app-facing operations: the UI calls `service.actions.*`, and each spec action
conforms against the action of the same name.

```ts
export const createRandomTodo = async (db: ServiceDatabase) => {
  const timing = await db.services.analytics.randomTodoRequested();
  const name = await db.services.nameGenerator.generateName();
  db.transactions.createTodo({ name });
  db.services.analytics.randomTodoAdded({ timing, name });
};
```

- **Every spec action has a same-named action**, even when it only forwards to one
  transaction. When the UI drives a richer op (a streamed drag), add a thin action for
  the spec op as well (`reorderTodo` beside `dragTodo`).
- **Type `db` on the lowest layer** exposing what it calls, usually `ServiceDatabase`.
  Never the action layer itself.
- **Call services here**: await ports, sequence calls, time a slow call. Then commit
  through transactions, preferably one per action so undo is one step.
- **Fire-and-forget.** Results flow back through observables, never return values.
- **Read current state synchronously** from the store (`db.resources`, `db.read`,
  `db.select`), never from a cached computed, which refreshes only on commit.
- The `index.ts` barrel feeds the `actions` facet.
