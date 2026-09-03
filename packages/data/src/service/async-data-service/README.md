# AsyncDataService

Utilities for working with asynchronous data services.

## Overview

AsyncDataServices are services that only contain:

- `Observe<Data>` properties
- Functions that accept only `Data` arguments and return:
  - `Observe<Data>`
  - `Promise<Data | void>`
  - `AsyncGenerator<Data>`
  - `void`

This constraint ensures services are purely data-oriented and can be easily wrapped, serialized, and composed.

## Usage

```typescript
import { AsyncDataService } from "@adobe/data/service";
```

## API

### `AsyncDataService.IsValid<T>`

Type utility to validate that a service conforms to the AsyncDataService pattern:

```typescript
import { Assert } from "@adobe/data/types/assert";

interface MyService extends Service {
  data: Observe<string>;
  fetchData: () => Promise<number>;
}

// Compile-time validation
type Check = Assert<AsyncDataService.IsValid<MyService>>;
```

### `AsyncDataService.createLazy({ load, schema, preload? })`

Creates a lazy-loading wrapper factory for a service. Returns a factory function that creates service instances. The real service is only loaded when first accessed (or, with `preload: true`, at browser idle). The service's sideloaded `Schema` (published beside it — see [is-valid-with-complete-schema.ts](./is-valid-with-complete-schema.ts)) drives how each member is wrapped, and TypeScript enforces that the schema completely describes the loaded service.

```typescript
// The service publishes its schema on the side
namespace MyService {
  export const schema = {
    type: "object",
    properties: {
      data: { type: "observe", value: {} },
      fetchData: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } },
    },
    required: ["data", "fetchData"],
    additionalProperties: false,
  } as const satisfies Schema;
}

// Define the factory
const createLazyService = AsyncDataService.createLazy({
  load: () => import('./my-service').then(m => m.createService()),
  schema: MyService.schema,
});

// Create instances
const service = createLazyService();
```

**With Constructor Args:**

```typescript
const createLazyService = AsyncDataService.createLazy({
  load: (config: Config) => import('./my-service').then(m => m.createService(config)),
  schema: MyService.schema,
});

const service = createLazyService({ apiUrl: '...' });
```

**Features:**

- ✅ Full type inference (no generic type parameters needed)
- ✅ Compile-time check that the schema completely describes the loaded service
- ✅ Lazy loading on first property access
- ✅ Call queuing for functions (all calls execute in order after load)
- ✅ Proper cleanup for Observe subscriptions
- ✅ Factory pattern for multiple instances with different args

See [create-lazy.md](./create-lazy.md) for complete documentation.

## Files

- **is-valid.ts** - Type utility for validating AsyncDataService conformance
- **is-valid-with-partial-schema.ts** - Valid service whose members include everything a schema describes (subset)
- **is-valid-with-complete-schema.ts** - Valid service whose members are exactly what a schema describes
- **create-lazy.ts** - Function signature for creating lazy service wrappers
- **create-lazy.test.ts** - Type safety tests
- **create-lazy.md** - Complete documentation and examples
- **public.ts** - Public API exports
- **index.ts** - Namespace export
