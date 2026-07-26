---
paths:
  - '**/services/**/*.ts'
  - '**/*-plugin.ts'
  - '**/*-plugin/**/*.ts'
  - '**/*dependent-state*.ts'
  - '**/*dependent-state*/**/*.ts'
---

# Observe pattern

`Observe<T>` from `@adobe/data/observe` — a subscription function: `(notify: (value: T) => void) => Unobserve`. Callback may be invoked
synchronously or asynchronously, zero or more times. Returns `Unobserve` to stop observing.

**Always use `Observe.*` helpers to create and manipulate observables. Never write raw subscriptions or manual notify wrappers** — the
standard helpers cover every composition need and keep the code consistent.

---

## Creation helpers

| Helper                               | Usage                                              |
| ------------------------------------ | -------------------------------------------------- |
| `Observe.fromConstant(value)`        | `Observe<T>` from a constant value                 |
| `Observe.fromProperties({ a, b })`   | Combine named observables into `Observe<{ a, b }>` |
| `Observe.fromArray([obs1, obs2])`    | Combine array of observables into `Observe<T[]>`   |
| `Observe.fromPromise(() => Promise)` | Lazy; notifies once when promise resolves          |
| `Observe.createState(initial?)`      | `[Observe<T>, (value: T) => void]` — mutable state |

```ts
const constant = Observe.fromConstant(42);
const combined = Observe.fromProperties({ a: db.observe.resources.a, b: db.observe.resources.b });
const [count, setCount] = Observe.createState(0);
```

---

## Transformation helpers

| Helper                              | Usage                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| `Observe.withMap(obs, fn)`          | Transform value; map from one type to another                |
| `Observe.withFilter(obs, fn)`       | Transform or filter; return `undefined` to skip              |
| `Observe.withDefault(default, obs)` | Use default when value is undefined                          |
| `Observe.withLazy(() => obs)`       | Defer expensive observable creation until first subscription |
| `Observe.withUnwrap(obs)`           | Flatten `Observe<Observe<T>>` to `Observe<T>`                |

```ts
const doubled = Observe.withMap(count, n => n * 2);
const max = Observe.withFilter(Observe.fromProperties({ a, b }), ({ a, b }) => Math.max(a, b));
const withFallback = Observe.withDefault('unknown', maybeName);
```

---

## Conversion helpers

| Helper                   | Usage                               |
| ------------------------ | ----------------------------------- |
| `Observe.toPromise(obs)` | Resolve with first value (one-shot) |

`Observe.toPromise` is for services reading a current value — **never use it in UI elements**.

---

## ⛔ Antipattern: synchronous "peek"

**Never read an observable's current value by subscribing and immediately unsubscribing.** The `notify` callback may fire asynchronously
(auth state, network, derived chains), so the snapshot is stale or `undefined`.

```ts
// WRONG — only works if the observable happens to emit synchronously on subscribe
let value: T | undefined;
const unobserve = someObservable(v => {
  value = v;
});
unobserve();
// use `value`  ← undefined for any async-resolving observable
```

```ts
// CORRECT — resolve the current value explicitly
const value = await Observe.toPromise(someObservable);
```

A stored `unobserve` is **only** ever for deferred teardown (returned from an Effect, called on unmount/cleanup) — never to bookend a
synchronous read. If a sync call site (e.g. a DOM event handler that must call `preventDefault()` before any `await`) needs the value, do
the synchronous work first, then `void asyncHelper(...)` that awaits `Observe.toPromise`. In a Lit render path, read reactive values through
`useObservableValues`, not `toPromise`.

---

## ⛔ Antipattern: `undefined` as an Observe data value

`@adobe/data/observe` reserves `undefined` to mean **"no value has been emitted yet"** — it gates the synchronous initial emit in
`Observe.createState`, `fromProperties`, and friends. A data value flowing through an Observe pipeline must use `null` for the absent case,
**never** `undefined`.

```ts
// WRONG — Observe<X | undefined>
const [projectId, setProjectId] = Observe.createState<ProjectId | undefined>(undefined);
return Observe.withDefault(undefined, cloudSync.projectName);

// CORRECT — Observe<X | null>
const [projectId, setProjectId] = Observe.createState<ProjectId | null>(null);
return Observe.withDefault<string | null>(null, cloudSync.projectName);
```

Why it bites:

- `createState<T | undefined>(undefined)` does **not** fire on subscribe (the implementation treats `undefined` as "not yet set"), so
  downstream `useObservableValues` callers wait forever for a value that never arrives.
- `fromProperties` re-emits when an input flips `undefined → defined`, not when a value changes — using `undefined` as data corrupts the
  dirty-tracking.
- `null` JSON-stringifies across the wire; `undefined` silently disappears.

When auditing new code, flag `Observe<… | undefined>`, `createState<… | undefined>`, `withDefault(undefined`, and `fromConstant(undefined)`
— each should use `null`. (A plain function returning `undefined`, e.g. an early `return` from an async helper, is unrelated and fine.)

---

## ⛔ Antipattern: membership-only subscription for value reads (ECS)

`db.observe.select(archetype.components)` fires **only when entities enter or leave the archetype** — i.e. on set-membership changes. It
does **not** fire when a component value changes on an entity already in the set. If the callback reads component **values**, this
subscription is almost always wrong: it emits once on load, then silently stops reacting when the user edits values (opacity slider,
selection toggle, drag end). The derived state goes stale with no error — the hardest bug to catch.

Pick the subscription by what the callback reads:

| Callback needs                                                          | Use                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Entity **IDs** only ("how many items," "does this track have children") | `db.observe.select(archetype.components)`                 |
| Component **values** (any `db.get(id, 'field')` in a map/filter)        | `Database.observeSelectDeep(db, [...fields] as const)`    |
| A single UI element bound to one entity                                 | `db.observe.entity(id)` / `observe.entity(id, archetype)` |

```ts
// WRONG — reads values but only reacts to add/remove; value edits never re-run this
Observe.withMap(db.observe.select(archetype.components), ids => ids.filter(id => (db.get(id, 'selectedByUsers') ?? []).includes(userId)));

// CORRECT — value-tracking subscription; list exactly the fields read downstream
const SELECTED_FIELDS = ['selectedByUsers'] as const; // hoist the tuple above the factory
const rows$ = Database.observeSelectDeep(db, SELECTED_FIELDS);
Observe.withMap(rows$, rows => rows.filter(r => r.selectedByUsers?.includes(userId)).map(r => r.id));
```

`observeSelectDeep` re-emits on **any** change to **any** listed component on **any** matched entity — so list only the fields actually
read, and when the matched set is large pair it with a structural deduplicate downstream so identical-looking emissions don't propagate
(`@adobe/data/observe`'s `withDeduplicate` is reference-equality only). `observeSelectDeep` from a UI element is banned — let each element
observe its own entity (see `.claude/rules/ecs.md` and `.claude/rules/squirrel/ui-data-access.md`).

---

## Common patterns

**Derived observable from service:**

```ts
export const isDevelopment = memoize((service: Pick<EnvironmentService, 'type'>) =>
  Observe.withMap(service.type, type => type === 'development')
);
```

**Computed from multiple resources:**

```ts
Observe.withFilter(Observe.fromProperties({ a: db.observe.resources.a, b: db.observe.resources.b }), ({ a, b }) => Math.max(a, b));
```

**Lazy creation:** `Observe.withLazy(() => expensiveObs)` — defers until first subscription.

---

## Execute

When adding or using Observe:

1. Use `Observe.fromConstant` for static values.
2. Use `Observe.fromProperties` to combine multiple observables.
3. Use `Observe.withFilter` when mapping and/or filtering.
4. Use `Observe.createState` for mutable state with a setter.
5. Use `Observe.withUnwrap` to flatten `Observe<Observe<T>>`.
6. Call `unobserve()` when cleaning up (e.g. component unmount).
