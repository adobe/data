# AsyncDataService.createLazy

## Overview

`AsyncDataService.createLazy` provides a type-safe way to create lazy-loading wrapper factories for AsyncDataServices. The real service is only loaded when the first property is accessed. Wrapping is driven by the service's **sideloaded schema** — a `Schema` authored beside the service (e.g. `MyService.schema`) and passed to `createLazy`. (Separately, a service may also expose that schema at runtime via the optional base-`Service` `schema` slot, typed `Observe<Schema>` so it can change as the interface evolves.)

## Import

```typescript
import { AsyncDataService } from "@adobe/data/service";
import { Schema } from "@adobe/data/schema";
```

## API Surface

```typescript
AsyncDataService.createLazy({
  load: (...args: any[]) => Promise<Service>,
  schema: Schema,          // the service's object schema (e.g. MyService.schema)
  preload?: boolean
}): (...args: Args) => Service
```

Returns a **factory function** that creates lazy service instances. TypeScript infers the service type and argument types from the `load` function, and enforces that `schema` completely and correctly describes the loaded service (see [Type Safety Guarantees](#type-safety-guarantees)).

### Preloading

By default a lazy service loads on first property access. Set `preload: true` to warm it at browser idle instead — it schedules the load via the browser's `requestIdleCallback`, so the first real call never races a cold load. Defaults to `false`, and is a no-op where `requestIdleCallback` is unavailable (SSR / Node / older browsers).

```typescript
AsyncDataService.createLazy({
  load: () => import('./analytics').then(m => m.create()),
  schema: AnalyticsService.schema,
  preload: true   // warm at browser idle
});
```

### The schema

`schema` is an object `Schema` whose `properties` describe each service member using the schema type-constructors. `createLazy` derives the runtime wrapper strategy from each member's schema:

- `{ type: "observe", value: S }` → an `Observe<T>` property
- `{ type: "function", signature: { returns: { type: "observe", … } } }` → a function returning `Observe<T>`
- `{ type: "function", signature: { returns: { type: "generator", … } } }` → a function returning `AsyncGenerator<T>`
- `{ type: "function", signature: { returns: { type: "promise", … } } }` → a function returning `Promise<T>`
- `{ type: "function" }` (no `signature`) → a function returning `void`

The function constructor groups its `parameters`/`returns` (and invocation-policy `external`) under a nested `signature`, so those members live only on function schemas. Use `value: {}` as a "don't-care" (resolves to `any`) when a member's precise value type doesn't matter for wrapping; fill in real value schemas when the schema is also a published contract. Function `signature.parameters` list only the **required** parameters. Publish the schema beside the service with the namespace pattern and validate it with `IsValidWithCompleteSchema`.

## Type Safety Guarantees

TypeScript enforces, via `IsValidWithCompleteSchema`:

1. ✅ **Completeness** — every service member must be described by the schema
2. ✅ **Type Matching** — each member's schema must match the actual member type
3. ✅ **No Extra Members** — the schema cannot describe members that don't exist on the service
4. ✅ **Clear Errors** — a mismatch reports a `SchemaMismatch` on the `schema` argument

## Usage Examples

### Basic Service (No Constructor Args)

```typescript
import { AsyncDataService } from "@adobe/data/service";
import { Schema } from "@adobe/data/schema";

interface AuthService extends Service {
  isSignedIn: Observe<boolean>;
  accessToken: Observe<string | null>;
  signIn: (url: string) => Promise<void>;
  signOut: () => void;
}

namespace AuthService {
  export const schema = {
    type: "object",
    properties: {
      isSignedIn: { type: "observe", value: {} },
      accessToken: { type: "observe", value: {} },
      signIn: { type: "function", signature: { parameters: [{}], returns: { type: "promise" } } },
      signOut: { type: "function" },
    },
    required: ["isSignedIn", "accessToken", "signIn", "signOut"],
    additionalProperties: false,
  } as const satisfies Schema;
}

// Define the lazy factory
const createLazyAuthService = AsyncDataService.createLazy({
  load: () => import('./auth-service').then(m => m.createAuthService()),
  schema: AuthService.schema,
});

// Create an instance
const authService = createLazyAuthService();
```

### Service With Constructor Args

```typescript
interface ConfigService extends Service {
  config: Observe<Config>;
  fetch: (endpoint: string) => Promise<Data>;
}

namespace ConfigService {
  export const schema = {
    type: "object",
    properties: {
      config: { type: "observe", value: {} },
      fetch: { type: "function", signature: { parameters: [{}], returns: { type: "promise", value: {} } } },
    },
    required: ["config", "fetch"],
    additionalProperties: false,
  } as const satisfies Schema;
}

type ServiceConfig = { apiUrl: string; timeout?: number };

const createLazyConfigService = AsyncDataService.createLazy({
  load: (config: ServiceConfig) => import('./config-service').then(m => m.create(config)),
  schema: ConfigService.schema,
});

// Create instances with different configs
const prodService = createLazyConfigService({ apiUrl: 'https://api.prod.com' });
const testService = createLazyConfigService({ apiUrl: 'https://api.test.com' });
```

### All Member Kinds

```typescript
interface ComplexService extends Service {
  status: Observe<string>;                                 // observe
  selectById: (id: string) => Observe<Data | null>;       // function → observe
  streamEvents: () => AsyncGenerator<Event>;              // function → generator
  fetchData: () => Promise<Data>;                          // function → promise
  clearCache: () => void;                                  // function → void
}

namespace ComplexService {
  export const schema = {
    type: "object",
    properties: {
      status: { type: "observe", value: {} },
      selectById: { type: "function", signature: { parameters: [{}], returns: { type: "observe", value: {} } } },
      streamEvents: { type: "function", signature: { returns: { type: "generator", value: {} } } },
      fetchData: { type: "function", signature: { returns: { type: "promise", value: {} } } },
      clearCache: { type: "function" },
    },
    required: ["status", "selectById", "streamEvents", "fetchData", "clearCache"],
    additionalProperties: false,
  } as const satisfies Schema;
}

const createLazyComplexService = AsyncDataService.createLazy({
  load: () => import('./complex').then(m => m.createService()),
  schema: ComplexService.schema,
});
```

## Compile-Time Error Examples

A schema that does not completely and correctly describe the service reports a `SchemaMismatch` on the `schema` argument:

```typescript
// ❌ Missing member 'signOut' — schema is not a complete description
AsyncDataService.createLazy({
  load: () => import('./auth').then(m => m.create()),
  schema: {
    type: "object",
    properties: { isSignedIn: { type: "observe", value: {} }, signIn: { type: "function", signature: { parameters: [{}], returns: { type: "promise" } } } },
    required: ["isSignedIn", "signIn"],
    additionalProperties: false,
  } as const satisfies Schema,   // ← error: schema omits `signOut` (and `accessToken`)
});

// ❌ Wrong kind — `isSignedIn` is an observe property, not a function
// ❌ Extra member — a property not on the service
// both likewise report a SchemaMismatch on the schema argument
```

## Behavior (Queue Strategy)

All calls are queued and executed in order once the service loads:

- **observe property** — subscription is deferred until the service loads
- **function → observe** — calls queued; each returns an `Observe` that subscribes when loaded
- **function → generator** — calls queued; each returns an `AsyncGenerator` that yields when loaded
- **function → promise** — calls queued; each returns a `Promise` that resolves when loaded
- **function → void** — calls queued; all execute in order when loaded

## Validation

Use `AsyncDataService.IsValid` to validate that a service conforms to the AsyncDataService pattern, and `IsValidWithCompleteSchema` to validate that a sideloaded schema matches it exactly:

```typescript
import { AsyncDataService, Assert } from "@adobe/data/service";

interface MyService extends Service {
  data: Observe<string>;
  fetchData: () => Promise<number>;
}

type CheckValid = Assert<AsyncDataService.IsValid<MyService>>;
type CheckSchema = Assert<AsyncDataService.IsValidWithCompleteSchema<MyService, typeof MyService.schema>>;
```

## Testing

See `create-lazy.test.ts` for comprehensive type safety tests including:

- Valid usage with all member kinds
- Error cases for missing / wrong / extra members
- Services with and without constructor args
