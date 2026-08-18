---
paths:
  - '**/features/*/services/main-service/service-database/services/**/*.ts'
---

# database/services/ — database-bound service factories

One factory per file: `create<Name>Service(service, …)` that binds a service
implementation to a live database — reading its observables and invoking
its transactions. This is where the async `services/` contracts (or
framework services like `AgenticService`) are wired to ECS state.

```ts
export const createAgentService = (service: TransactionDatabase, mark: PlayerMark): AgenticService =>
    /* … reads service.observe.*, calls service.transactions.* … */;
```

Type `service` on the lowest layer exposing what the factory reads/calls (never
the `service-database` itself — that would be a cycle).

An `index.ts` barrel re-exports the factories; `service-database.ts`
registers them under the `services` facet, each keyed by the name
consumers read it as (`service.services.agent`). Defining a standalone
service contract (not yet bound to a database) belongs in the feature
`services/` layer.
