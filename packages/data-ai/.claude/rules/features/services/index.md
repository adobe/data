---
paths:
  - '**/features/*/services/**/*.ts'
---

# services/ — the feature's services

A service is the boundary between the feature and the outside world (generation,
analytics, networking). Each is a namespace folder (`global/namespace.md`) holding its
interface, its implementation and a fake. Services depend only on `data/`.

```
services/
  analytics-service/
    analytics-service.ts   # the interface + `export * as AnalyticsService from "./public.js"`
    create.ts              # the implementation
    create-fake.ts         # the fake
    public.ts              # export { create }; export { createFake };
  services.ts              # type Services = { … }
```

## The interface — an async data service

```ts
export interface AnalyticsService extends Service {
  todoCreated: (args: { readonly name: string }) => void;
  randomTodoRequested: () => Promise<Timing>;
}
type _Valid = Assert<AsyncDataService.IsValid<AnalyticsService>>;
export * as AnalyticsService from "./public.js";
```

- Members are async only: `void | Promise<T> | AsyncGenerator<T> | Observe<T>`. They
  send and receive Data, or async callbacks and observers of Data, which keeps a
  service portable across processes and lazily loadable.
- The interface is the only place `interface` is used. Validate it with
  `AsyncDataService.IsValid`.
- A service that carries non-Data configuration the app injects (a host plugin, a
  callback) cannot pass `IsValid`; skip the assert for it, and keep such services rare.
- A type only one service uses lives on its namespace (`AnalyticsService.Timing`),
  or in its interface file.

## `create` and `createFake`

- **`create`** is the implementation. When it can't be built without runtime input
  (a transport, a host-provided plugin), make `create` throw, telling the reader
  which input is missing; the app injects the real one with
  `Database.create(plugin, { services })`.
- **`createFake`** returns the service with every method present and inert. It is an
  ordinary export (the bundler drops it when unused). Conformance calls it only to
  list the service's methods; each case supplies the returns (`spec/index.md`).
- Access them statically (`AnalyticsService.createFake`) so tree-shaking works.

## `services.ts` — the injectable map

```ts
export type Services = {
  readonly analytics: AnalyticsService;
  readonly nameGenerator: NameGeneratorService;
};
```

- Spec actions inject with `Pick<Services, …>`.
- `ecs/services/` registers the same keys, pinned with
  `Assert<Equal<ServiceDatabase["services"], Services>>`.
- A feature built on another intersects the lower map:
  `type Services = MainServices & { readonly baz: BazService }`.
- A feature with no services has no `services/` folder.

A service that reads the database or calls its transactions is not a `services/`
service. It is a database-bound factory in `ecs/services/`.
