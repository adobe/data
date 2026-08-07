---
paths:
  - '**/features/*/services/main-service/**/actions/**/*.ts'
---

# services/main-service/actions/ — async orchestration

One action per file: a function taking the **whole database** as its first
argument and pure `data/` args. Actions orchestrate anything *outside* a
single transaction — awaiting a `services/` port, sequencing calls, deriving
timing — and then commit the result through a transaction.

**Every state transition has a corresponding same-named action** — the async,
app-facing realization the UI calls. It reads the same services the transition
injects from `db.services`, so it reproduces both the transition's state change
(through a transaction) and its side effects. It may reuse another transition's
transaction (`createRandomTodo` reuses `createTodo`) — there need not be a
same-named transaction; transactions are the looser layer.

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
- **Read current state synchronously from the store** (`db.resources` / `db.read`
  / `db.select`, then a pure `data/` helper) — never from a cached `computed`.
  Reactive computeds refresh only on a committed transaction, so an imperative
  read of one can hand back a stale shared cache (and it's the UI's layer, not
  the action's). This also keeps the action correct under the conformance seed.
- **Conformance** (`conformance/actions.test.ts`) runs each transition's shared
  cases against its action, asserting **state and effects**: build the db with
  fake services via `Database.create(MainService.plugin, { services })`, run the
  action, then `matches(toState, after)` and check the recorded service calls
  against the case's `effects` (see `conformance.md`).
- An `index.ts` barrel feeds the `actions` plugin facet.
