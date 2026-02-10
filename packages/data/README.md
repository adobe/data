# @adobe/data
Adobe Data Oriented Programming Library

## Documentation

[Main Page](https://git.corp.adobe.com/pages/neuralfiltersplatform/firefly-data/docs/api/)

[ECS Performance Test](https://git.corp.adobe.com/pages/neuralfiltersplatform/firefly-data/docs/perftest.html)

## Breaking API Changes

Until we reach 1.0.0, minor version changes may be API breaking.

## Data Oriented Programming

This library is built using a data oriented and functional programming paradigm.
We prefer composition over inheritance, avoid classes when possible and emphasize separation of concerns.

## Data

This library uses data oriented design paradigm and prefers pure functional interfaces whenever practical.

For our purposes, `Data` is immutable `JSON` (de)serializable objects and primitives.

### Why immutable Data?

We prefer Data because it is easy to:
- serialize
- deserialize
- inspect
- compare
- hash
- validate

We prefer immutable Data because it is easy to:
- reason about
- avoid side effects
- avoid defensive copying
- use for pure function arguments and return values
- use with concurrency
- memoize results
    - use as cache key (stringified)
    - use as cache value

### What is Data Oriented Design?

Sanders Mertens covers this thoroughly in his ECS FAQ:

[https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#what-is-data-oriented-design](https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#what-is-data-oriented-design)

### Data Schemas

When runtime type information is required we use `JSON Schema`. In order to avoid redundancy, we can use `FromSchema` to derive a typescript type at compile time.

Example:

```typescript
const Float32Schema = { type: "number", precision: 1 } as const satisfies Schema;
const Float32 = FromSchema<typeof Float32Schema>; // number
```

It is important that we use `as const` for the schema definition. Without that, the typeof Float32Schema would be `{ type: string, precision: number }` instead of `{ type: "number", precision: 1 }` and we would not be able to derive a correct type using `FromSchema`.

### Normalized Data

Data is considered "Normalized" when all object keys contained anywhere within it are lexigraphically sorted. We include a `normalize` function which performs this conversion. This is particularly useful when you want to use data as a cache key.

```typescript
const notNormalized = { b: 2, a: 1 };
const normalized = normalize(notNormalized); // { a: 1, b: 2 }
```

## Observables

An `Observable<T>` is a subscription function that you can pass a callback function to. Your callback function can accept a single argument of type `T`. The subscription function returns a dispose function that accepts no parameters and can be called at any point in the future to cancel your subscription.

Your callback function *may* be called back synchronously (before the initial call returns) zero or one times and asynchronously later any number of times.

For more information see the [Observable API documentation](./docs/api/modules/observe.html)

### Observable Types

```typescript
/**
 * Called to add a new observer to an Observable.
 * Returns an Unobserve function that can be called to stop observing the Observable.
 */
export type Observable<T> = (observer: Callback<T>) => Unobserve;
/**
 * Callback function called zero or more times with a sequence of values.
 * *may* be called back synchronously, immediately when selector function is called.
 * *may* also be called back asynchronously later any number of times.
 * *may* be called multiple sequential times with the same value.
 */
export type Callback<T> = (value: T) => void;
/**
 * Function called to stop observing an Observable.
 */
export type Unobserve = () => void;
```

An Observable can be thought of sort of like a Promise but with a few important differences.
- A Promise only yields a single value, an Observable yields a sequence of values.
- A Promise can reject with an error, an Observable can not. (It could yield type `MyResult | MyError` though.)
- A Promise can only resolve asynchronously, an Observable *may* yield an initial result synchronously.
    - An Observable is allowed to call the Callback callback function immediately upon observation if it has a value.
- A Promise begins executing immediately, an Observable may lazily wait for a first observer before taking any action.
- An Observable can be unobserved.

### Observable Creation

This simple definition of an Observable makes it very easy to create them from various sources.

- `fromConstant<T>(value: T) => Observable<T>`
- `fromPromise<T>(promise: Promise<T>): Observable<T>`
- `fromPromiseWithError<T, E extends Error>(promise: Promise<T>): Observable<T | E>`
- `fromObservableProperties` converts an object with named Observable values into a single Observable of an object with corresponding types.

For instance:

```typescript
fromObservables({ a: fromConstant(1), b: fromConstant("s")})
// yields type Observable<{ a: number, b: string }>
```

`fromObservableProperties` will only yield a result once every contained observable has provided a result. If some properties are optional then use the `withOptional` higher order function described below.

### Observable Modification

They are also very easy to modify in order to build higher order Observables.

For the purposes of discussion let us use an array to indicate the sequential values yielded by an Observable with the first element being any synchronous callback and `void` meaning no synchronous callback.

So our `fromConstant(12)` would yield `[12]` and `fromPromise(Promise.resolve(12))` would yield `[void, 12]`

These examples will use the form of: Sequence Before => Higher Order Function => Sequence After.

withDeduplicate removes any sequentially equivalent values:

`[1, 1, 2, 2, 2, 3]` => `withDeduplicate` => `[1, 2, 3]`

withDefault replaces any undefined values, including initial synchronous value with a default value:

`[void, 1, 2, undefined, 4]` => `withDefault(-1)` => `[-1, 1, 2, -1, 4]`

withMap applies a mapping function to each value at notification time:

`[void, 1, 2, 3]` => `withMap(x => x * 2)` => `[void, 2, 4, 6]`

withOptional converts an `Observable<T>` to `Observable<T | undefined>` and will always respond synchronously.

`[void, 1, 2, 3, 4]` => `withOptional` => `[undefined, 1, 2, 3, 4]`

## Cache

The cache module contains functions and interfaces related to caching, hashing, memoization and storage and retrieval of `Blob`s.

The `memoize` function and `BlobStore` are the most important public interfaces in the cache submodule. They are described below. See the API reference for hashing and other lower level functions.

The `memoize` function can be used to cache expensive, deterministic, asynchronous functions that take data arguments and return data results. In addition to caching the results, it also blocks multiple simultaneous calls with the same arguments and makes them wait for the first result.

### BlobStore

It is important to handle `Blob`s correctly within an application.

The `BlobStore` interface and corresponding `blobStore` exported instance provide a convenient way to convert `Blob`s into small JSON handles to them called `BlobRef`s. Those `BlobRef`s can later be converted back into a `Blob`.

`Blob`s within the `blobStore` are generally persisted across sessions using the browsers buid in `Cache` storage.

`BlobRef`s have a number of advantages over directly using blobs.
`BlobRef`s are:
- small json objects
- deterministic for each `Blob` based on mime type and content.
- suitable for persistence to locations with limited size.
- suitable for use as a cache key
- suitable for use as a cache value

## Schemas

Contains some standard data type schemas in JSON Schema format for convenience. These types are most frequently used when describing components within the Entity Component System. Knowing the precise size and signedness of primitive numeric types allows the ECS to store these values within tightly packed typed arrays internally. This makes memory usage and processing time more efficient.

## Entity Component System (ECS)

This ECS database is a high performance, strongly typed typescript implementation inspired by the Sanders Mertens C++ based [Flecs](https://www.flecs.dev/flecs/md_docs_2Docs.html).

This library provides two main interfaces for ECS operations: **Store** and **Database**. They share the same read API but differ significantly in their approach to writing and observability.

### Store Interface

The **Store** is the foundational, low-level interface for direct ECS data operations.

**Key Characteristics:**
- **Direct Access**: Provides immediate, synchronous read/write access to entities, components, and resources
- **No Transaction Control**: Changes are applied directly without transaction boundaries  
- **No Observability**: Changes are not automatically observable or trackable
- **High Performance**: Minimal overhead for direct operations using Structure of Arrays (SoA) with linear memory layout of numeric types for optimal cache performance
- **Core ECS Operations**: Includes entity creation, component updates, archetype querying, and resource management

**Usage**: Ideal for scenarios requiring fast, direct ECS manipulation where you don't need change tracking or transactional safety.

```typescript
// Create a store with components, resources, and archetypes
const store = createStore(
  { 
    position: Vec3.schema, 
    health: { type: "number" },
    player: { const: true } 
  },
  { 
    gravity: { default: 9.8 as number } 
  },
  {
    Player: ["position", "health", "player"],
    Particle: ["position"]
  }
);

// Direct operations
const playerId = store.archetypes.Player.insert({ 
  position: [0, 0, 0], 
  health: 100, 
  player: true 
});
store.update(playerId, { position: [1, 1, 1] });
store.resources.gravity = 10.0;
```

### Database Interface

The **Database** wraps a Store to provide **transaction-based operations** with **full observability**.

**Key Characteristics:**
- **Transaction-Based**: All changes must occur within predefined atomic transactions that can be undone.
- **Full Observability**: Every change is observable through the `observe` API
- **Predefined Operations**: Uses predefined transaction functions rather than direct mutations
- **Undo/Redo Support**: Transactions generate undo/redo operations automatically
- **Change Tracking**: Tracks which entities, components, and archetypes changed
- **Event Notifications**: Automatically notifies observers of changes

**Usage**: Ideal for applications requiring change history, multiplayer synchronization, undo/redo functionality, or reactive UI updates.

**Important Note**: Even when using a Database, transaction functions are written as direct modifications to the underlying Store interface. The Database wraps these operations to provide transactional guarantees and observability.

```typescript
// Create a database with predefined transactions
const database = createDatabase(store, {
  createPlayer(t, args: { position: Vector3, health: number }) {
    // Transaction function receives Store interface for direct operations
    return t.archetypes.Player.insert({ 
      ...args, 
      player: true 
    });
  },
  movePlayer(t, args: { entity: Entity, position: Vector3 }) {
    // Direct Store operations within transaction context
    t.update(args.entity, { position: args.position });
  },
  setGravity(t, gravity: number) {
    // Direct resource modification within transaction
    t.resources.gravity = gravity;
  }
});

// Execute transactions (these provide observability and undo/redo)
const playerId = database.transactions.createPlayer({ 
  position: [10, 20, 0], 
  health: 100 
});
database.transactions.movePlayer({ entity: playerId, position: [15, 25, 5] });

// Observe all changes
database.observe.transactions((result) => {
  console.log('Transaction applied:', result);
  console.log('Changed entities:', result.changedEntities);
  console.log('Undo operations:', result.undo);
});

// Observe specific entities
database.observe.entity(playerId)((entityData) => {
  if (entityData) {
    console.log('Player moved to:', entityData.position);
  }
});
```

### What is an ECS?

Sanders Mertens also covers this thoroughly in his ECS FAQ:

[https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#what-is-ecs](https://github.com/SanderMertens/ecs-faq?tab=readme-ov-file#what-is-ecs)

In addition to the Entity, Component and System definitions which are standard, we also use the term Resource. A Resource is just a value which is defined globally on the ECS itself and not attached to any specific Entity. You can think of them as a singleton Component.

## Performance Test

[Performance Test](https://git.corp.adobe.com/pages/neuralfiltersplatform/firefly-data/docs/perftest.html)
