# AsyncDataService.createLazy

## Overview

`AsyncDataService.createLazy` provides a type-safe way to create lazy-loading wrapper factories for AsyncDataServices. The real service is only loaded when the first property is accessed.

## Import

```typescript
import { AsyncDataService } from "@adobe/data/service";
```

## API Surface

```typescript
AsyncDataService.createLazy(
  load: (...args: any[]) => Promise<Service>,
  properties: { [key: string]: PropertyDescriptor }
): (...args: Args) => Service
```

Returns a **factory function** that creates lazy service instances. TypeScript automatically infers both the service type and argument types from the `load` function.

### Descriptor Format

```typescript
type LazyServiceDescriptor<T extends Service, Args = void> = {
  // Loader function - may accept optional constructor args
  load: Args extends void 
    ? () => Promise<T> 
    : (args: Args) => Promise<T>;
  
  // Must describe every property (excluding base Service properties)
  properties: {
    [K in Exclude<keyof T, keyof Service>]: PropertyDescriptor<T[K]>;
  };
};
```

### Property Descriptors

Each property must be described with a string that matches its type:

- `'observe'` - For `Observe<T>` properties
- `'fn:observe'` - For functions returning `Observe<T>`
- `'fn:generator'` - For functions returning `AsyncGenerator<T>`
- `'fn:promise'` - For functions returning `Promise<T>`
- `'fn:void'` - For functions returning `void`

## Type Safety Guarantees

TypeScript will enforce:

1. ✅ **Completeness** - All service properties must be declared
2. ✅ **Type Matching** - Each descriptor must match the actual property type
3. ✅ **No Extra Properties** - Cannot add properties that don't exist in service
4. ✅ **Clear Errors** - Missing or wrong types produce clear compile errors

## Usage Examples

### Basic Service (No Constructor Args)

```typescript
import { AsyncDataService } from "@adobe/data/service";

interface AuthService extends Service {
  isSignedIn: Observe<boolean>;
  accessToken: Observe<string | null>;
  signIn: (url: string) => Promise<void>;
  signOut: () => void;
}

// Define the lazy factory
const createLazyAuthService = AsyncDataService.createLazy(
  () => import('./auth-service').then(m => m.createAuthService()),
  {
    isSignedIn: 'observe',
    accessToken: 'observe',
    signIn: 'fn:promise',
    signOut: 'fn:void'
  }
);

// Create an instance
const authService = createLazyAuthService();
```

### Service With Constructor Args

```typescript
import { AsyncDataService } from "@adobe/data/service";

interface ConfigService extends Service {
  config: Observe<Config>;
  fetch: (endpoint: string) => Promise<Data>;
}

type ServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

// Define the lazy factory
const createLazyConfigService = AsyncDataService.createLazy(
  (config: ServiceConfig) => import('./config-service').then(m => m.create(config)),
  {
    config: 'observe',
    fetch: 'fn:promise'
  }
);

// Create instances with different configs
const prodService = createLazyConfigService({ apiUrl: 'https://api.prod.com' });
const testService = createLazyConfigService({ apiUrl: 'https://api.test.com' });
```

### All Property Types

```typescript
import { AsyncDataService } from "@adobe/data/service";

interface ComplexService extends Service {
  // Observe property
  status: Observe<string>;
  
  // Function returning Observe
  selectById: (id: string) => Observe<Data | null>;
  
  // Function returning AsyncGenerator
  streamEvents: () => AsyncGenerator<Event>;
  
  // Function returning Promise
  fetchData: () => Promise<Data>;
  
  // Function returning void
  clearCache: () => void;
}

const createLazyComplexService = AsyncDataService.createLazy(
  () => import('./complex').then(m => m.createService()),
  {
    status: 'observe',
    selectById: 'fn:observe',
    streamEvents: 'fn:generator',
    fetchData: 'fn:promise',
    clearCache: 'fn:void'
  }
);

const service = createLazyComplexService();
```

## Compile-Time Error Examples

### Missing Property

```typescript
// ❌ Error: Property 'signOut' is missing
const error = AsyncDataService.createLazy(
  () => import('./auth').then(m => m.create()),
  {
    isSignedIn: 'observe',
    accessToken: 'observe',
    signIn: 'fn:promise'
    // Missing: signOut - TypeScript will error
  }
);
```

### Wrong Descriptor Type

```typescript
// ❌ Error: Type '"fn:observe"' is not assignable to type '"observe"'
const error = AsyncDataService.createLazy(
  () => import('./auth').then(m => m.create()),
  {
    isSignedIn: 'fn:observe', // Wrong: should be 'observe'
    accessToken: 'observe',
    signIn: 'fn:promise',
    signOut: 'fn:void'
  }
);
```

### Extra Property

```typescript
// ❌ Error: 'unknownProp' does not exist in type
const error = AsyncDataService.createLazy(
  () => import('./auth').then(m => m.create()),
  {
    isSignedIn: 'observe',
    accessToken: 'observe',
    signIn: 'fn:promise',
    signOut: 'fn:void',
    unknownProp: 'observe' // Extra: doesn't exist in service
  }
);
```

## Behavior (Queue Strategy)

All calls are queued and executed in order once the service loads:

- **`'observe'`** - Subscription is deferred until service loads
- **`'fn:observe'`** - Calls are queued, each returns Observe that subscribes when loaded
- **`'fn:generator'`** - Calls are queued, each returns AsyncGenerator that yields when loaded
- **`'fn:promise'`** - Calls are queued, each returns Promise that resolves when loaded
- **`'fn:void'`** - Calls are queued, all execute in order when loaded

## Validation

Use `AsyncDataService.IsValid` to validate that a service conforms to the AsyncDataService pattern:

```typescript
import { AsyncDataService, Assert } from "@adobe/data/service";

interface MyService extends Service {
  data: Observe<string>;
  fetchData: () => Promise<number>;
}

// This will compile successfully if MyService is a valid async data service
type CheckValidDataService = Assert<AsyncDataService.IsValid<MyService>>;
```

## Testing

See `create-lazy.test.ts` for comprehensive type safety tests including:
- Valid usage with all property types
- Error cases for missing/wrong/extra properties
- Services with and without constructor args
