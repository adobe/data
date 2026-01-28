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

### `AsyncDataService.createLazy<T, Args?>(descriptor)`

Creates a lazy-loading wrapper around a service. The real service is only loaded when first accessed.

```typescript
const lazyService = AsyncDataService.createLazy<MyService>({
  load: () => import('./my-service').then(m => m.createService()),
  properties: {
    data: 'observe',
    fetchData: 'fn:promise'
  }
});
```

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
