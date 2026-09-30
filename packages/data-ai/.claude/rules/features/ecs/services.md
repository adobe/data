---
paths:
  - '**/features/*/ecs/services/**/*.ts'
---

# ecs/services/ — registering services on the database

`service-database.ts` registers the feature's services under the `services` facet,
keyed as the spec's `Services` map, and pins the two together:

```ts
const serviceDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  services: {
    nameGenerator: NameGeneratorService.create,
    analytics: AnalyticsService.create,
  },
});
export type ServiceDatabase = Database.Plugin.ToDatabase<typeof serviceDatabasePlugin>;
type _ServicesPin = Assert<Equal<ServiceDatabase["services"], Services>>;
```

- **A `services/` service** registers its `create`. If `create` throws (the service
  needs runtime input), the app injects the real one (`../../app.md`), and conformance
  injects a fake (`conformance.md`).
- **A database-bound service** (it reads observables or calls transactions, such as
  an agent) is a factory here, one per file: `createAgentService(db, …)`, with `db`
  typed on the lowest layer it needs. The `index.ts` barrel re-exports the factories.
- **A service built from another service** needs that service registered first, so
  register it in a second `Plugin.create` extending the first: a factory only sees
  the services of the plugins it extends.
- Register each service once, in the feature that owns it, under one key. Combined
  plugins require the same factory per key.
