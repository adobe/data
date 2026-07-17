---
paths:
  - '**/ecs/services/**/*.ts'
---

# database/services/ — database-bound service factories

One factory per file: `create<Name>Service(db, …)` that binds a service
implementation to a live database — reading its observables and invoking
its transactions. This is where the async `services/` contracts (or
framework services like `AgenticService`) are wired to ECS state.

```ts
export const createAgentService = (db: TictactoeDatabase, mark: PlayerMark): AgenticService =>
    /* … reads db.observe.*, calls db.transactions.* … */;
```

An `index.ts` barrel re-exports the factories; `service-database.ts`
registers them under the `services` facet, each keyed by the name
consumers read it as (`db.services.agent`). Defining a standalone service
contract (not yet bound to a db) belongs in the feature `services/` layer.
