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

**Entity** — a unique integer ID. Persistent entities have positive IDs; nonPersistent entities have negative IDs.

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

### Naming an archetype's row type

Each `db.archetypes.<Name>` is a `ReadonlyArchetype<Row>` whose `Row` is
derived from the declared columns. To name that row elsewhere — a function
parameter, a public field — **derive it; don't re-declare it.** Derive the
service type from the plugin, then pull the row out with
`Database.Archetype.RowOf`:

```ts
type WorldService = Database.Plugin.ToDatabase<typeof worldPlugin>;
type PlayerRow = Database.Archetype.RowOf<WorldService, "Player">;

const a: ReadonlyArchetype<PlayerRow> = db.archetypes.Player; // no cast
```

Because the service type is derived from the same plugin, `db.archetypes`
assigns to `WorldService["archetypes"]` directly. Do **not** hand-author a
narrower archetype row and `as`-cast `db.archetypes` to fit it — a hand-written
type drifts from the real columns, and the cast hides that drift. Let the row
follow from the declaration.

### Naming archetype rows under `stripInternal` (hand-written service interfaces)

`Database.Archetype.RowOf` derives from the plugin **database** type. That is
the right tool when your public service type *is*
`Database.Plugin.ToDatabase<typeof plugin>`. It does **not** work when you keep
a hand-written public service interface and mark the plugin database type
`@internal` (common to keep `.d.ts` emit small and to hide internals):

- Referencing the plugin database type from a public type forces the emitter to
  serialize `typeof plugin` into your `.d.ts` → **TS7056**.
- Marking it `@internal` and deriving from it leaves a **dangling reference** to
  the stripped symbol in your emitted `.d.ts` → downstream **TS2305**.
  TypeScript never resolves an archetype row *through* an `@internal` symbol; it
  preserves the reference.

Instead, expose a small **public schema** (just `components` + `archetypes`) and
derive rows from it with `ArchetypeRowOf` / `ArchetypeHandleOf`. The emitted
type then references only public symbols — no plugin type, no `@internal`
symbol:

```ts
import type { ArchetypeHandleOf } from "@adobe/data/ecs";

// public — small, emits cleanly
export const trackComponents = { trackKind: { type: "string" }, muted: { type: "boolean" } } as const;
export const trackSchema = {
    components: trackComponents,
    archetypes: { Track: ["trackKind", "muted"] },
} as const;

// the plugin built from `trackSchema` may stay @internal
export interface TrackService {
    readonly archetypes: {
        // reference the handle INLINE (see emit notes below)
        readonly Track: ArchetypeHandleOf<typeof trackSchema, "Track">;
    };
}
```

`db.archetypes.Track` (from the `@internal` db) is assignable to
`TrackService["archetypes"]["Track"]` with no cast, and downstream consumers
resolve `Track` to its concrete columns.

**Declaration-emit footguns** (TypeScript quirks; the
`scripts/emit-stripinternal` gate guards them):

- Reference `ArchetypeHandleOf<…>` **inline** in the interface, or import it as
  `import { type ArchetypeHandleOf }`. A pure `import type` alias reached
  through the package barrel and used *only* as a nested type argument can be
  silently elided from emit.
- Don't put fenced ` ```ts ` code blocks containing `import`/`export`/`interface`
  in JSDoc directly above an exported type.
- Don't let the schema be the **lone** export of a `stripInternal`-emitted
  module — pair it with another export (e.g. the `components` object above).

### Partition components (experimental)

> **Experimental.** API and semantics may change in a future minor release.

A **partition component** (a primitive component marked `partition: true`) stores every distinct runtime value in its *own* archetype — the "shared component" pattern. Within a partition archetype the value is constant, so its column is a zero-per-row const buffer, and entities sharing a value are contiguous in memory (a coarse, storage-level spatial/grouping index).

```ts
const worldPlugin = Database.Plugin.create({
  components: {
    cell: { type: "integer", partition: true }, // primitive only
    position: Vec3.schema,
  },
  archetypes: { Occupant: ["cell", "position"] },
  transactions: {
    // A partitioned named archetype is a Router: `insert` routes each row to the
    // concrete child archetype for its `cell` value (created on first use).
    spawn: (t, cell: number, pos: [number, number, number]) =>
      t.archetypes.Occupant.insert({ cell, position: pos }),
  },
});
```

- **`ensureArchetype(keys)`** returns a `Router` (write-only: `insert` only) when `keys` include a partition component without a value; supply the value — `ensureArchetype(keys, { cell: 7 })` — to get the concrete child archetype (dense columns) directly.
- **Reads** go through `queryArchetypes(include, { where })`: `where` filters by partition value at *archetype* granularity (O(archetypes), no row scan), e.g. `queryArchetypes(["cell", "position"], { where: { cell: 7 } })`. Omit `where` to iterate every value-child.
- **`select(..., { order })`** whose leading order key(s) are partition components sorts per-bucket and concatenates — O(N log(N/K)), and O(N) when a partition key is the sole order key.
- **`update`** that changes a partition value migrates the entity to the child for the new value (like adding/removing a component).
- **Multiple** partition components compose: archetypes are the *cross product* of the distinct value tuples.

**Cost / when to use.** Changing a partition value is a structural move (archetype migration), and archetype count is the product of distinct values across all partition columns — so a fine or fast-changing key fragments badly. Partition on **coarse, low-cardinality, slowly-changing** keys (region, team, layer); use a normal component + an [index](#indexes) or an external structure for fine or per-frame keys. A store that declares no partition component pays nothing.

## Indexes

Indexes give O(1) lookup by some derived or column-valued key. Declare them on the plugin alongside components and archetypes; the runtime maintains them automatically on every insert/update/delete and exposes typed lookup handles at `db.indexes.<name>` and `t.indexes.<name>` (inside transactions).

### Declaration shape

| Field | Required | Shape |
|---|---|---|
| `key` | yes | `"col"` ∣ `["col1", "col2"]` ∣ `{ slot: "col" ∣ (c) => Value }` |
| `order` | no | `{ by: string[]; compare?: (a, b) => number }` |
| `unique` | no | `boolean` — when `true`, exposes `get(arg) → Entity \| null` |
| `components` | only when an extractor function reads a column not already implied by an identity string in `key`/`order` | `string[]` |
| `archetype` | no | a declared archetype name — scopes the index to that archetype |

**The lookup argument is always a named object.** `find` / `get` / `observe` take `{ field: value, … }` — never a bare scalar — so the shape is uniform across every index and reads self-documentingly (`find({ parent: 7 })`, not `find(7)`). The fields are:

- `key: "col"` — sugar for the one-column tuple `["col"]`; the argument is `{ col: value }`.
- `key: ["a", "b"]` — one field per column: `{ a, b }`.
- `key: { slot: … }` — one field per slot. A **computed** key is a slot map whose value is an extractor, e.g. `{ emailLower: (c) => c.email!.toLowerCase() }`; the argument is `{ emailLower: string }`. (There is no bare `(…) => value` key form — a computed value needs a name to appear in the object, so it lives in a slot.)

Each **extractor receives a single named object** `c` of the component values, read by name (`c.email`) rather than by argument position. Its type is `Partial<C>`: at runtime only the index's declared `components` are populated, and the type marks every field optional rather than unsafely implying all of `C` is present — so use `!` / `?.` on the components you declared (`(c) => c.email!.toLowerCase()`).

`find(arg) → readonly Entity[]` returns every entity in the matching bucket (sorted if `order` is declared). `get(arg) → Entity | null` is exposed only on unique indexes; `null` means "we know this key has no entity," never `undefined`. Array values (a `T[]` column, or an extractor that returns `T[]`) auto-fan-out into one bucket entry per element, so the field takes the element type (`find({ assigned: "joe" })` against `assigned: string[]`).

`observe(arg) → Observe<readonly Entity[]>` is the reactive form of `find`. It emits the current bucket synchronously on subscribe, then re-emits — on a microtask after a committed transaction — whenever that bucket's membership *or order* changes, and stays silent for transactions that touch only other buckets. Prefer it over pairing `db.observe.select(..., { where })` with `find`: a sort-key-only reorder changes the index's order but not the `where` result, so the `select` form silently swallows the reorder while `observe` reports it.

**Scoping to an archetype.** By default an index covers *every* entity that has its key columns, across all archetypes. Set `archetype` to restrict it to one:

```ts
archetypes: { Task: ["parent", "priority"], Note: ["parent", "body"] },
indexes: {
    // only Tasks — a Note with the same `parent` is NOT indexed here
    tasksByParent: { key: "parent", archetype: "Task" },
},
// db.indexes.tasksByParent.find({ parent: 7 }) → only Task entities
```

The name is checked against the schema's declared archetypes (a typo is a compile error). Scope is by **superset of that archetype's components**: an entity is indexed only if it has all of `Task`'s columns, so entities in other archetypes that merely share the key column are excluded, and seeding walks only the matching archetypes.

### Pattern catalogue

#### Raw indexes (identity reads from columns)

**Single-column unique lookup**
```ts
indexes: {
    byEmail: { key: "email", unique: true },
}
// db.indexes.byEmail.get({ email: "alice@x.com" }) → Entity | null
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
// db.indexes.childrenOf.find({ parent: P }) → readonly Entity[]
```

**Sorted children** — `OrderedChildOf` style with top-level columns:
```ts
indexes: {
    orderedChildrenOf: { key: "parent", order: { by: ["fractIndex"] } },
}
// db.indexes.orderedChildrenOf.find({ parent: P }) → readonly Entity[]   // sorted by fractIndex
```

**Multi-value (array column)** — per-element fan-out is automatic:
```ts
indexes: {
    tasksByAssignee: { key: "assigned" },   // assigned: string[]
}
// db.indexes.tasksByAssignee.find({ assigned: "joe" }) → all tasks where assigned includes "joe"
```

#### Computed indexes (extractor in a slot)

A computed key is a slot map; each extractor receives a single named object `c` (`Partial<C>` — declared `components` are the ones populated) and returns the slot's value. The slot name becomes the lookup field.

**Scalar derived key** (case-insensitive lookup):
```ts
indexes: {
    byEmailCi: { components: ["email"], key: { email: (c) => c.email!.toLowerCase() } },
}
// db.indexes.byEmailCi.find({ email: "ALICE@x.com" }) → readonly Entity[]
```

**Multi-value computed** — an extractor that returns an array fans each element into its own bucket entry:
```ts
indexes: {
    docsByKeyword: { components: ["body"], key: { keyword: (c) => extractTags(c.body!) } },
}
// db.indexes.docsByKeyword.find({ keyword: "typescript" })
```

**Compound key from nested data** — `MappedChildOf` when the relationship data lives in one nested component:
```ts
// player: { parent: Team, key: Position }
indexes: {
    playerByRoster: {
        components: ["player"],
        key: { team: (c) => c.player!.parent, position: (c) => c.player!.key },
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
        key: { parent: (c) => c.foo!.parent },
        order: {
            by: ["foo"],
            compare: (a, b) => a.foo.order < b.foo.order ? -1 : 1,
        },
    },
}
// db.indexes.orderedChildrenOfFoo.find({ parent: T }) → readonly Entity[]   // sorted by foo.order
```

#### Combined / advanced

**Mixed identity + derived parts in one compound key**:
```ts
indexes: {
    playerByTeamRole: {
        components: ["player"],
        key: {
            team: "team",                  // identity from top-level `team` column
            role: (c) => c.player!.position, // derived from nested player.position
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
        key: { team: (c) => c.item!.parent, role: (c) => c.item!.key },
        order: {
            // code-point compare — never localeCompare (see Order semantics)
            by: ["item"],
            compare: (a, b) => compare(a.item.fractIndex, b.item.fractIndex),  // from @adobe/data/functions
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
// db.indexes.tasksByPriority.find({ owner: ownerEntity }) → readonly Entity[]   // ordered per comparator
```

### Order semantics

- `order` is always a single object: `{ by, compare? }`. `by` declares which columns are read into the per-entity sort cache; `compare` (if present) is the comparator over `Pick<C, by>`. When `compare` is omitted, the default is ascending across `by` left-to-right with positional tie-break.
- All direction control happens through the comparator — there are no `asc: true | false` booleans. Descending, mixed direction, case-insensitive, semver, and natural-sort comparators are all written the same way.
- **String ordering is by code point, never locale.** The default comparator and the ordered-query sort both use the canonical `compare` from `@adobe/data/functions` (`<` / `>` — code-point for strings, numeric for numbers), and you should too in custom `compare` callbacks rather than `String.prototype.localeCompare`. `localeCompare` is collation-dependent (varies by host locale) and would make index / query order non-deterministic across machines.

### Auto-routing of `select`

When `db.select(include, { where })` or `db.observe.select(...)` is called with a `where` clause that exactly matches the `key` of a declared raw index by equality, the query is served from the index instead of scanning archetypes. No code-site change required — declare the index and the planner picks it up.

An `order` clause is routed too: when the query also asks for `order` and the matched index is sorted (default comparator) on exactly those columns, in sequence, all ascending, the already-sorted bucket is returned without a second sort. A descending clause, a mismatched/partial column sequence, or an index with a custom comparator falls through to the archetype scan unchanged — as does any non-equality `where`, partial-key match, or function/slot-map-keyed index.

### Maintenance and atomicity

- Indexes are maintained *eagerly* per mutation, so `t.indexes.<name>` inside a transaction sees rows the transaction has just written.
- Unique constraints are pre-checked before any column mutation. A conflict throws *from the offending insert/update call*; the existing transaction rollback path restores both the store and the index together. No partial mutation lands in either the store or the index.

### Performance characteristics

Index maintenance is **O(b)** per change, where `b` is the number of buckets the affected entity occupies (usually 1, more for multi-value fan-out). It is *never* proportional to total entities in the index or to a bucket's size. Sorting (when an `order` is declared) is deferred to the first read that touches a dirty bucket.

| Declaration | Per-insert cost | Per-delete cost | Notes |
|---|---|---|---|
| `key: "col"` (non-unique) | `O(1)` | `O(1)` | `Set<Entity>` per bucket. |
| `key: "col"`, `unique: true` | `O(1)` | `O(1)` | Map set; throws on duplicate. |
| `key: ["a", "b", …]` | `O(k)` where `k` = key arity | `O(k)` | One serialized key per row. |
| `key: (...) => v` (scalar) | `O(1 + compute)` | `O(1)` | Compute runs once per row. |
| `key: "arr"` where `arr: T[]` | `O(m)` where `m` = array length | `O(m)` | One bucket per array element. |
| `key: (...) => T[]` (multi) | `O(m + compute)` | `O(m)` | Same fan-out, derived. |
| `key: { slot: ..., ... }` | `O(s + Π array sizes)` | `O(s + Π array sizes)` | `s` = slot count; cartesian fan-out across array-valued slots. |
| `+ order: { by, compare? }` | adds `O(b)` for the snapshot | adds `O(b)` for cache invalidation. No comparator calls. |

The crucial property: removing one entity from a non-unique bucket holding `N` entities is `O(1)`, not `O(N)`. Non-unique buckets are stored as `Set<Entity>` so `Set.delete` is the hot path — no `arr.indexOf` scan. Verified by `database.index.performance.test.ts`: deleting from a 40 000-entity bucket has the same per-delete cost as deleting from a 4 000-entity bucket.

Reads pay one catch-up sort the first time they touch a dirty bucket:

| Read | First call after writes | Subsequent calls |
|---|---|---|
| `find(key)` (unsorted) | `O(1)` Map lookup + `O(n)` slice | same |
| `find(key)` (sorted, dirty) | `O(n log n)` sort, then slice | `O(1)` Map lookup + `O(n)` slice |
| `findRange(filter)` | `O(B)` walk + per-matched-bucket sort if dirty | per-matched-bucket sort only on first read after a write |
| `get(key)` (unique) | `O(1)` Map lookup | same |

`B` = total bucket count for the index. A `find` against a bucket that has not received any writes since the previous `find` is free (clean buckets aren't re-sorted).

#### `observe(key)` reactivity cost

`observe` re-emits on the transaction-commit boundary, coalescing every mutation in a tick into a single recompute per subscriber. With `b` = observed bucket size and `N` = live subscribers on the index:

| Event | Cost per subscriber | Notes |
|---|---|---|
| Committed transaction, wakeup gate | `O(min(C, R))` | `C` = changed components, `R` = index read columns. Runs for all `N` subscribers → `O(N·min(C,R))` total. |
| Flush, observed bucket **unchanged** | `O(b)` | Recompute `find` (clean, cached sort) + sequence compare; emission suppressed. |
| Flush, observed bucket **changed** | `O(b log b)` + `O(b)` emit | Dirty bucket pays one catch-up sort, then emits the `b`-element array. |

Emission is `O(b)` and optimal (the API hands back the full array). Two known sub-optimalities, both inherited from layers below `observe` rather than the reactive wiring itself:

1. **Coarse, component-level wakeup.** The gate fires on *any* change to a column the index reads, not on a change to *this* bucket. A mutation to a sibling bucket therefore costs each subscriber an `O(b)` recompute whose emission is then suppressed — `O(N·b)` of suppressed work per transaction in a wide fan-out (many buckets, many observers, one shared column). The optimum is `O(1)`: a per-bucket version stamp the observer compares against a cached value, or an observer registry keyed by bucket so only affected subscribers wake. This would require `createIndex` to track per-bucket versions / hold the observer registry (today `observe` is built one layer up, over `find` + transaction notifications, and stays out of the index internals). It is a contained change but deliberately deferred — it matches the same coarseness `db.observe.select` already has, so the two stay consistent.

2. **Lazy full re-sort.** A changed bucket re-sorts in `O(b log b)` (see the read table) rather than maintaining order incrementally at `O(log b)` per mutation. This is an index-wide design trade-off (full re-sort wins for batched writes that touch ≳ `b/log b` of a bucket); switching a bucket to a persistent ordered structure would help observe-heavy, sparsely-mutated buckets but is a broader change with its own trade-offs.

**Unique-conflict timing:** the conflict check runs *before* the column store mutates. The throw originates from the insert/update call; the rollback path restores any state the transaction touched. Verified by `database.index.test.ts` ("unique conflict on insert is caught up-front — no partial store or index mutation") and `database.index.performance.test.ts`.

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

The transaction argument `t` is a `Store` — the same store type used everywhere else, carrying the entities, resources, index handles, and the initiating `userId` (set by the dispatcher, `undefined` in local-only databases). A store *is* the context a transaction operates on, so type transaction and helper parameters as `Store` (or a plugin's `Database.Plugin.ToStore<P>`).

> **Obsolete:** the separate `TransactionContext` type (and `Database.Plugin.ToTransactionContext<P>`) has been removed. Use `Store` / `ToStore<P>` directly — `ToStore` now includes the index handles and `userId`.

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

nonPersistent entities, and components/resources whose schema is marked `nonPersistent: true`, are excluded from serialization.

## Type Utilities

```ts
// Derive the full Database type from a plugin
type MyDB = Database.FromPlugin<typeof myPlugin>;

// Derive the Store type (for transaction function signatures)
type MyStore = Database.Plugin.ToStore<typeof myPlugin>;
```

---

## Reference: nonPersistent and Intermediate Semantics

The ECS separates two orthogonal ideas. **nonPersistent** means *not persisted* (excluded from serialization). **Intermediate** means *not the final committed step* of a transaction sequence.

### nonPersistent Component

A built-in optional component that can only be set at entity creation time. It cannot be added to or removed from an existing entity. Entities created with this component are allocated negative IDs and stored in a separate entity table that is never serialized.

### nonPersistent Entities

Entities created with the `nonPersistent` component. They always have negative IDs and are never persisted. Use them for session-only or UI-local state (selections, hover states, panel positions, etc.).

### nonPersistent Schema

A component or resource schema with `nonPersistent: true`. This marks the *column's data* as not persisted; unlike the component, such a column can live on a persistent (positive-ID) entity. The column is excluded from serialization and reset to its default on load.

```ts
resources: {
  isHovering: { default: false as boolean, nonPersistent: true },
},
```

Setting `nonPersistent: true` on a **resource** schema also places that resource's singleton entity in the negative-ID space (it gets the `nonPersistent` component), so the resource resets to its default on load.

### Intermediate Transaction

A transaction that is part of an async sequence and is not the final committed step. Each `yield` in an async generator transaction produces an intermediate transaction, as do reconciling-database replays. Intermediate transactions notify observers but are not pushed to the undo stack and should not trigger persistence. Exposed as `TransactionResult.intermediate`.

### `TransactionResult` flags

Every `TransactionResult` carries two independent booleans:

| Flag | Source | Meaning |
|---|---|---|
| `intermediate` | Caller-provided via `execute` options | The transaction is a non-final step, not the final commit |
| `persistent` | Derived from what changed | At least one changed entity is persistent (id ≥ 0) |

These are orthogonal. All four combinations are valid:

| `intermediate` | `persistent` | Example |
|---|---|---|
| `false` | `true` | Normal committed change to persistent data |
| `true` | `true` | Async generator yield that modifies persistent entities |
| `false` | `false` | Committed change to UI-only state (e.g. selection) |
| `true` | `false` | Intermediate step touching only nonPersistent data |

### Consumer Guidelines

**Persistence observers** should skip intermediate transactions and those with nothing persistent to save:

```ts
db.observe.transactions((t) => {
  if (t.intermediate || !t.persistent) return;
  save();
});
```

**Undo/redo** should skip intermediate transactions (non-final steps shouldn't clutter the undo stack) but may still record nonPersistent-only ones when marked undoable, since users may want to undo UI state changes like selection:

```ts
db.observe.transactions((t) => {
  if (t.undoable && !t.intermediate) {
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
