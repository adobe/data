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

## Indexes

Indexes give O(1) lookup by some derived or column-valued key. Declare them on the plugin alongside components and archetypes; the runtime maintains them automatically on every insert/update/delete and exposes typed lookup handles at `db.indexes.<name>` and `t.indexes.<name>` (inside transactions).

### Declaration shape

| Field | Required | Shape |
|---|---|---|
| `key` | yes | `string` ∣ `string[]` ∣ `(args) => Value` ∣ `{ slot: string ∣ (args) => Value }` |
| `order` | no | `{ by: string[]; compare?: (a, b) => number }` |
| `unique` | no | `boolean` — when `true`, exposes `get(key) → Entity \| null` |
| `components` | only when an extractor function reads a column not already implied by an identity string in `key`/`order` | `string[]` |

`find(key) → readonly Entity[]` returns every entity in the matching bucket (sorted if `order` is declared). `get(key) → Entity | null` is exposed only on unique indexes; `null` means "we know this key has no entity," never `undefined`. Array values (a `T[]` column, or a `compute` return that is `T[]`) auto-fan-out into one bucket entry per element.

### Pattern catalogue

#### Raw indexes (identity reads from columns)

**Single-column unique lookup**
```ts
indexes: {
    byEmail: { key: "email", unique: true },
}
// db.indexes.byEmail.get("alice@x.com") → Entity | null
```

**Multi-column compound unique** — `MappedChildOf` style when both parts are top-level columns:
```ts
indexes: {
    playerSlot: { key: ["team", "position"], unique: true },
}
// db.indexes.playerSlot.get({ team: T, position: "qb" }) → Entity | null
```

**Non-unique by single column** — `ChildOf` style:
```ts
indexes: {
    childrenOf: { key: "parent" },
}
// db.indexes.childrenOf.find(P) → readonly Entity[]
```

**Sorted children** — `OrderedChildOf` style with top-level columns:
```ts
indexes: {
    orderedChildrenOf: { key: "parent", order: { by: ["fractIndex"] } },
}
// db.indexes.orderedChildrenOf.find(P) → readonly Entity[]   // sorted by fractIndex
```

**Multi-value (array column)** — per-element fan-out is automatic:
```ts
indexes: {
    tasksByAssignee: { key: "assigned" },   // assigned: string[]
}
// db.indexes.tasksByAssignee.find("joe") → all tasks where assigned includes "joe"
```

#### Computed indexes (function-derived)

**Scalar derived key** (case-insensitive lookup):
```ts
indexes: {
    byEmailCi: { components: ["email"], key: (email) => email.toLowerCase() },
}
// db.indexes.byEmailCi.find("ALICE@x.com") → readonly Entity[]
```

**Multi-value computed** — `compute` returns an array, each element becomes a bucket entry:
```ts
indexes: {
    docsByKeyword: { components: ["body"], key: (body) => extractTags(body) },
}
// db.indexes.docsByKeyword.find("typescript")
```

**Compound key from nested data** — `MappedChildOf` when the relationship data lives in one nested component:
```ts
// player: { parent: Team, key: Position }
indexes: {
    playerByRoster: {
        components: ["player"],
        key: { team: (p) => p.parent, position: (p) => p.key },
        unique: true,
    },
}
// db.indexes.playerByRoster.get({ team: T, position: "qb" }) → Entity | null
```

**Sorted from nested data** — `OrderedChildOf` with nested struct:
```ts
// foo: { parent: Entity, order: FractionalIndex }
indexes: {
    orderedChildrenOfFoo: {
        components: ["foo"],
        key: (f) => f.parent,
        order: {
            by: ["foo"],
            compare: (a, b) => a.foo.order < b.foo.order ? -1 : 1,
        },
    },
}
// db.indexes.orderedChildrenOfFoo.find(T) → readonly Entity[]   // sorted by foo.order
```

#### Combined / advanced

**Mixed identity + derived parts in one compound key**:
```ts
indexes: {
    playerByTeamRole: {
        components: ["player"],
        key: {
            team: "team",                // identity from top-level `team` column
            role: (p) => p.position,     // derived from nested player.position
        },
        unique: true,
    },
}
// db.indexes.playerByTeamRole.get({ team: T, role: "qb" }) → Entity | null
```

**Computed mapped *and* sorted** — full `SortedMappedChildOf`:
```ts
indexes: {
    orderedRoster: {
        components: ["item"],
        key: { team: (i) => i.parent, role: (i) => i.key },
        order: {
            by: ["item"],
            compare: (a, b) => a.item.fractIndex.localeCompare(b.item.fractIndex),
        },
        unique: true,
    },
}
// db.indexes.orderedRoster.get({ team: T, role: "qb" }) → Entity | null
```

**Custom comparator** — descending, mixed direction, locale-aware, semver, etc.:
```ts
indexes: {
    tasksByPriority: {
        key: "owner",
        order: {
            by: ["priority", "due"],
            compare: (a, b) => b.priority - a.priority || a.due - b.due,   // priority desc, due asc
        },
    },
}
// db.indexes.tasksByPriority.find(ownerEntity) → readonly Entity[]   // ordered per comparator
```

### Order semantics

- `order` is always a single object: `{ by, compare? }`. `by` declares which columns are read into the per-entity sort cache; `compare` (if present) is the comparator over `Pick<C, by>`. When `compare` is omitted, the default is ascending across `by` left-to-right with positional tie-break.
- All direction control happens through the comparator — there are no `asc: true | false` booleans. Descending, mixed direction, case-insensitive, semver, and natural-sort comparators are all written the same way.

### Auto-routing of `select`

When `db.select(include, { where })` or `db.observe.select(...)` is called with a `where` clause that exactly matches the `key` of a declared raw index by equality, the query is served from the index instead of scanning archetypes. No code-site change required — declare the index and the planner picks it up. Other query shapes fall through to the archetype scan unchanged.

### Maintenance and atomicity

- Indexes are maintained *eagerly* per mutation, so `t.indexes.<name>` inside a transaction sees rows the transaction has just written.
- Unique constraints are pre-checked before any column mutation. A conflict throws *from the offending insert/update call*; the existing transaction rollback path restores both the store and the index together.

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

---

## Reference: Transaction Determinism Contract

**Transaction functions must be pure functions of `(store, args)`.**

This is an implicit contract that single-client use does not enforce but multi-client sync makes load-bearing. The `ReconcilingDatabase` achieves cross-peer convergence by shipping `TransactionEnvelope` values (name + args) across the network instead of raw operation lists, and by rolling back and replaying local transients whenever a committed envelope arrives. Both mechanisms rely on a critical property: given the same database state and the same args, `transactionFn(store, args)` must produce exactly the same mutations every time it runs.

**Violations that break convergence:**

```ts
// BAD — result depends on wall-clock time
moveEntity: (t, args) => {
  t.update(args.entity, { lastSeen: Date.now() });
},

// BAD — result depends on a random value
spawnParticle: (t, args) => {
  t.archetypes.Particle.insert({ id: Math.random(), ... });
},

// BAD — result depends on module-level mutable state
let counter = 0;
assignId: (t, args) => {
  t.update(args.entity, { assignedId: counter++ });
},
```

**Allowed patterns:**

- Reading from `store` (entities, components, resources) — the store's committed state is identical on every peer at the moment of replay.
- Using values derived from `args` — args are serialized and broadcast verbatim.
- Calling pure math / pure utility functions.
- Generating ids deterministically from args (e.g. hashing a user-provided name).

**If you need a timestamp or random value**, generate it on the caller side and include it in `args`:

```ts
// GOOD — timestamp baked into the envelope before broadcast
db.transactions.moveEntity({ entity, x, y, z, timestamp: Date.now() });
```

**Design implication for multi-user operations:** Prefer parametrizing transactions on database-resident state rather than raw entity ids held at the call site. For example, "move what user X has selected" is safer than "move entity 7" because the selected set is committed database state (identical on every peer), whereas entity 7 may refer to different entities on different peers during the speculative transient phase. See the `ReconcilingDatabase` for the reconciliation protocol details.
