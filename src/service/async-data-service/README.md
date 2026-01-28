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

### `AsyncDataService.createLazy(load, properties)`

Creates a lazy-loading wrapper factory for a service. Returns a factory function that creates service instances. The real service is only loaded when first accessed. TypeScript automatically infers service and argument types.

```typescript
// Define the factory
const createLazyService = AsyncDataService.createLazy(
  () => import('./my-service').then(m => m.createService()),
  {
    data: 'observe',
    fetchData: 'fn:promise'
  }
);

// Create instances
const service = createLazyService();
```

**With Constructor Args:**

```typescript
const createLazyService = AsyncDataService.createLazy(
  (config: Config) => import('./my-service').then(m => m.createService(config)),
  { data: 'observe', fetch: 'fn:promise' }
);

const service = createLazyService({ apiUrl: '...' });
```

**Features:**
- ✅ Full type inference (no generic type parameters needed)
- ✅ Lazy loading on first property access
- ✅ Call queuing for functions (all calls execute in order after load)
- ✅ Proper cleanup for Observe subscriptions
- ✅ Factory pattern for multiple instances with different args

See [create-lazy.md](./create-lazy.md) for complete documentation.

## Files

- **is-valid.ts** - Type utility for validating AsyncDataService conformance
- **create-lazy.ts** - Function signature for creating lazy service wrappers
- **create-lazy.test.ts** - Type safety tests
- **create-lazy.md** - Complete documentation and examples
- **public.ts** - Public API exports
- **index.ts** - Namespace export

## Backwards Compatibility

For backwards compatibility, `IsDataService` is still exported from `@adobe/data/service`:

```typescript
import { IsDataService } from "@adobe/data/service";

// Equivalent to AsyncDataService.IsValid
type Check = Assert<IsDataService<MyService>>;
```
