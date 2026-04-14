# ECS — Entity Component System

A high-performance, strongly typed ECS database for TypeScript. All application state is modeled as plugins, and all mutations flow through observable transactions.

## Quick Start

```ts
import { Database } from "@adobe/data/ecs";

const myPlugin = Database.Plugin.create({
  resources: {
    score: { default: 0 as number },
  },
  transactions: {
    addPoints: (t, points: number) => {
      t.resources.score += points;
    },
  },
});

const db = Database.create(myPlugin);

db.observe.resources.score((score) => console.log("Score:", score));
db.transactions.addPoints(10);
```

## Core Concepts

**Entity** — a unique integer ID. Persistent entities have positive IDs; ephemeral entities have negative IDs.

**Component** — a named data column. Each component has a schema that describes its type. Numeric schemas (F32, Vec3, etc.) are stored in tightly packed typed arrays for cache-friendly performance.

**Resource** — a global singleton value, not tied to any specific entity. Think of it as a single-row component.

**Archetype** — a named grouping of components that defines what data an entity carries. Entities are stored in archetype tables with Structure-of-Arrays (SoA) layout.

**Transaction** — a synchronous, atomic mutation of the database. Transactions produce undo/redo operations and notify observers.

**Action** — a function that can be async and may call at most one transaction. Actions are the bridge between async side effects and the synchronous transaction model.

**System** — a function created at database initialization, optionally returning a 60fps tick function. Systems can be ordered relative to each other.

**Plugin** — a self-contained bundle of components, resources, archetypes, transactions, actions, computed observables, services, and systems. Plugins compose via `extends` (single parent) or `Database.Plugin.combine` (multiple peers).

## Plugin Structure

Create plugins with `Database.Plugin.create`. Properties must appear in this order (all optional):

```ts
Database.Plugin.create({
  extends: basePlugin,     // 1. single parent plugin
  services: { ... },       // 2. singleton service factories
  components: { ... },     // 3. component schemas
  resources: { ... },      // 4. global state with defaults
  archetypes: { ... },     // 5. named component groupings
  computed: { ... },       // 6. derived observables
  transactions: { ... },   // 7. synchronous mutations
  actions: { ... },        // 8. async operations
  systems: { ... },        // 9. tick functions
});
```

Property order is enforced at runtime — misordering throws an error.

## Components

Components are schema-described data columns. Use numeric schemas from `@adobe/data/math` for high-performance linear-memory storage, or plain type-cast defaults for general data.

```ts
import { Vec3, F32 } from "@adobe/data/math";

const physicsPlugin = Database.Plugin.create({
  components: {
    position: Vec3.schema,
    velocity: Vec3.schema,
    mass: F32.schema,
    name: { type: "string", maxLength: 50 },
  },
  archetypes: {
    Particle: ["position", "velocity", "mass"],
    NamedParticle: ["position", "velocity", "mass", "name"],
  },
  // ...
});
```

## Resources

Resources hold global state. Define them with a default value and a type assertion:

```ts
const gamePlugin = Database.Plugin.create({
  resources: {
    score: { default: 0 as number },
    paused: { default: false as boolean },
    config: { default: { difficulty: "normal" } as GameConfig },
  },
  // ...
});
```

For resources that are initialized later (e.g. by a system or service), use `null as unknown as Type`:

```ts
resources: {
  controller: { default: null as unknown as GameController },
},
```

## Archetypes

Archetypes define the component shape of entity kinds. They determine how entities are stored and queried.

```ts
const worldPlugin = Database.Plugin.create({
  components: {
    position: Vec3.schema,
    health: F32.schema,
    player: { const: true },
    npc: { const: true },
  },
  archetypes: {
    Player: ["position", "health", "player"],
    NPC: ["position", "health", "npc"],
  },
  transactions: {
    spawnPlayer: (t, pos: { x: number; y: number; z: number }) => {
      return t.archetypes.Player.insert({
        position: [pos.x, pos.y, pos.z],
        health: 100,
        player: true,
      });
    },
  },
});
```

## Transactions

Transactions are synchronous, deterministic functions that mutate the store. They automatically produce undo/redo operations and notify observers.

```ts
transactions: {
  moveEntity: (t, args: { entity: Entity; x: number; y: number; z: number }) => {
    t.update(args.entity, { position: [args.x, args.y, args.z] });
  },
  setScore: (t, score: number) => {
    t.resources.score = score;
  },
  removeEntity: (t, entity: Entity) => {
    t.delete(entity);
  },
},
```

### Async Transactions

When a transaction is called with a function argument, it supports async workflows. An async generator yields intermediate (transient) values before returning the final committed value:

```ts
// Async generator — each yield applies transiently, only the return commits
db.transactions.updatePosition(async function* () {
  yield { entity: id, x: 1, y: 0, z: 0 };  // transient
  await someAsyncWork();
  yield { entity: id, x: 2, y: 0, z: 0 };  // transient
  await moreAsyncWork();
  return { entity: id, x: 3, y: 0, z: 0 };  // committed
});
```

Each `yield` rolls back the previous intermediate state and applies the new one. Only the final `return` value persists. If the generator throws, all intermediate state is rolled back.

## Actions

Actions receive the full database and can be async. They should call at most one transaction to keep undo/redo correct. UI should never consume action return values — data flows down via observables.

```ts
actions: {
  loadAndApply: async (db, url: string) => {
    const data = await fetch(url).then(r => r.json());
    db.transactions.applyData(data);
  },
},
```

## Computed Observables

Computed values are derived observables created from database state. Each factory receives the database and returns an `Observe<T>`.

```ts
import { Observe } from "@adobe/data/observe";

const plugin = Database.Plugin.create({
  resources: {
    board: { default: createInitialBoard() },
    firstPlayer: { default: "X" as PlayerMark },
  },
  computed: {
    currentPlayer: (db) =>
      Observe.withFilter(db.observe.resources.board, (board) =>
        getCurrentPlayer(board, db.resources.firstPlayer),
      ),
    isGameOver: (db) =>
      Observe.withFilter(db.observe.resources.board, checkGameOver),
  },
  // ...
});
```

## Services

Services are singleton objects created at database initialization. Extended plugin services initialize first, guaranteeing dependency order.

```ts
const appPlugin = Database.Plugin.create({
  extends: basePlugin,
  services: {
    analytics: (db) => createAnalyticsService(db),
    logger: (db) => createLogger(db.services.analytics),
  },
  // ...
});
```

Service factories can be overridden at database creation for testing:

```ts
const db = Database.create(appPlugin, {
  services: { analytics: mockAnalyticsService },
});
```

## Systems

Systems run initialization logic and optionally return a tick function for 60fps frame processing. Scheduling constraints control execution order.

```ts
systems: {
  physics_update: {
    create: (db) => {
      // initialization code runs once
      return () => {
        // tick function runs every frame
        const dt = db.resources.time.delta;
        // update physics...
      };
    },
    schedule: { before: ["render_update"] },
  },
  render_update: {
    create: (db) => () => {
      // runs after physics_update
    },
  },
},
```

Systems that only need to run once at init can return `void` instead of a tick function.

## Plugin Composition

### Single Inheritance

Use `extends` for single-parent relationships:

```ts
const uiPlugin = Database.Plugin.create({
  extends: gamePlugin,
  resources: {
    showMenu: { default: false as boolean },
  },
  // uiPlugin has access to all of gamePlugin's types
});
```

### Combining Peers

Use `Database.Plugin.combine` to merge multiple independent plugins:

```ts
const combinedPlugin = Database.Plugin.combine(physicsPlugin, renderPlugin, audioPlugin);
const db = Database.create(combinedPlugin);
```

## Observing State

```ts
const db = Database.create(myPlugin);

// Observe a resource
db.observe.resources.score((score) => { /* ... */ });

// Observe a component column (fires on any change to that component)
db.observe.components.position(() => { /* position data changed */ });

// Observe a specific entity
db.observe.entity(entityId)((values) => {
  if (values) { /* entity exists with these values */ }
  else { /* entity was deleted */ }
});

// Observe all transactions
db.observe.transactions((result) => {
  // result.changedEntities, result.changedComponents, etc.
});
```

## Serialization

```ts
// Save
const data = db.toData();

// Restore
db.fromData(data);
```

Ephemeral entities and components marked `ephemeral: true` in their schema are excluded from serialization.

## Type Utilities

```ts
// Derive the full Database type from a plugin
type MyDB = Database.FromPlugin<typeof myPlugin>;

// Derive the Store type (for transaction function signatures)
type MyStore = Database.Plugin.ToStore<typeof myPlugin>;
```

---

## Reference: Transient and Ephemeral Semantics

The ECS uses the terms "ephemeral" and "transient" with precise, distinct meanings. Ephemeral means **not persisted**. Transient means **intermediate value**.

### Ephemeral Component

A built-in optional component that can only be set at entity creation time. It cannot be added to or removed from an existing entity. Entities created with this component are allocated negative IDs and stored in a separate entity table.

### Ephemeral Entities

Entities created with the `ephemeral` component. They always have negative IDs and are never persisted. Use ephemeral entities for session-only or UI-local state (selections, hover states, panel positions, etc.).

### Ephemeral Schema

A component or resource schema with `ephemeral: true`. This marks the data as not persisted, but unlike the ephemeral component, it can live on a persistent entity. Ephemeral schemas are excluded from serialization but their entities still carry positive IDs.

```ts
resources: {
  isHovering: { default: false as boolean, ephemeral: true },
},
```

### Transient Transaction

A transaction that is part of an async sequence and is not the final committed step. Each `yield` in an async generator transaction produces a transient transaction. Reconciling database replays also produce transient transactions. Transient transactions notify observers but are not pushed to the undo stack and should not trigger persistence.

### Ephemeral Transaction

A transaction whose `TransactionResult.ephemeral` property is `true`. This happens when every entity touched by the transaction is an ephemeral entity (negative ID). If even one persistent entity was modified, the transaction is not ephemeral.

### How They Interact on `TransactionResult`

Every `TransactionResult` carries two independent boolean flags:

| Flag | Source | Meaning |
|---|---|---|
| `transient` | Caller-provided via `execute` options | The transaction is an intermediate step, not the final commit |
| `ephemeral` | Derived from what changed | The transaction only touched ephemeral entities |

These flags are orthogonal. All four combinations are valid:

| `transient` | `ephemeral` | Example |
|---|---|---|
| `false` | `false` | Normal committed change to persistent data |
| `true` | `false` | Async generator yield that modifies persistent entities |
| `false` | `true` | Committed change to UI-only state (e.g. selection) |
| `true` | `true` | Intermediate step touching only ephemeral data |

### Consumer Guidelines

**Persistence observers** should skip both transient and ephemeral transactions — transient results are not final, and ephemeral results have nothing to persist:

```ts
db.observe.transactions((t) => {
  if (t.transient || t.ephemeral) return;
  save();
});
```

**Undo/redo** should skip transient transactions (intermediate steps shouldn't clutter the undo stack) but may still record ephemeral ones when marked undoable, since users may want to undo UI state changes like selection:

```ts
db.observe.transactions((t) => {
  if (t.undoable && !t.transient) {
    pushToUndoStack(t);
  }
});
```
