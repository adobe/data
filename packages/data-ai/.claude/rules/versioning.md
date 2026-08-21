---
paths:
  - '**/versioning/**/*.ts'
  - '**/versions.ts'
  - '**/versions.test.ts'
---

# Database schema versioning & upgrade-on-load

A versioned `@adobe/data` database keeps an ordered **version history** so an old
persisted document can be upgraded to the current schema on load. You (human or
agent) should almost never have to reason about this by hand: **change the schema,
run the tests, and the failing test prints the exact fix to apply.**

## The pieces (all from `@adobe/data/ecs`)

- **`versions.ts`** — `export const versions: readonly VersionEntry[]`. `entries[i]`
  IS version `i`; `entries[0]` is a frozen copy of the initial schema. `currentVersion
  = versions.length - 1`.
- **`VersionEntry`** — `{ version, changes: { components?, resources? }, handler? }`.
  `version` MUST equal the array index. `changes` is a **JSON Merge Patch** applied to
  the folded-so-far schema — record ONLY what changes, not a restated copy:
  - `name: { …fields… }` adds a new component/resource, or deep-merges those fields
    onto the existing schema;
  - a key set to **`undefined`** DELETES it — `name: undefined` drops the whole
    component/resource; a nested `precision: undefined` drops just that field;
  - `null` is a normal VALUE (so `default: null` sets the default), not a delete;
    arrays/scalars replace wholesale.
  Because it MERGES, a shape change must delete the fields that no longer apply —
  number → object is `{ type: "object", properties: {…}, precision: undefined, default: undefined }`,
  never a bare `{ type: "object", … }` (which would keep the old `precision`/`default`).
  Never write empty `changes: {}` — an entry must record at least one change. Components
  and resources are separate namespaces. `handler` is present ONLY for a change that is
  not automatically convertible.
- A `databaseVersion` (or similarly named) **integer resource** on the plugin, `default`
  set to `currentVersion`. Stamped into the document; excluded from the history itself.
- **`createVersionUpgrader(versions, { document: "databaseVersion" })`** passed as
  `Database.create(plugin, { versioning })`. The option maps each PERSISTED quadrant to
  its version resource — `{ document, settings }`. Give `settings` its own integer
  resource only if you save the settings quadrant separately (see rule 7); most apps
  version just the `document` quadrant and pass `{ document: "databaseVersion" }`.
- Two co-located guard tests in `versions.test.ts` (see below).

## Rules — do not violate

1. **Existing entries are FROZEN.** Never edit, reorder, or delete an entry — it is
   historical fact. Only ever APPEND a new entry.
2. **Version 0 is a deep copy, never a reference.** It must not change when the live
   schema changes; that is the whole point of a history.
3. **Additive & minor changes need NO handler** — the load path auto-converts them
   (add-field-with-default, widen/narrow, reorder, clamp, add component/resource).
   Just record the `changes` patch.
4. **Breaking changes REQUIRE a handler** — a type change, a rename, splitting/moving
   a field. Write it with `remapStoreComponent(store, name, newSchema, old => newValue)`
   inside the entry's `handler`, and add a test case (rule 6).
5. **Removing a component drops its data.** If the data still matters, migrate it in a
   handler BEFORE the removal entry.
6. **Versioned schemas must be REAL** — declare a `type` (or `enum`/`const`), and the
   `default` must be fully described by that schema (no extra keys/structure). Only
   SESSION values (`nonPersistent` AND `nonShared`, e.g. a GPU buffer) may be untyped,
   and those are never versioned — leave them out of the history entirely.
7. **A handler touches ONE quadrant.** Persisted quadrants (shared+persistent = the
   cloud document; nonShared+persistent = local settings) can be saved separately and
   drift to DIFFERENT versions. On load they are merged into one store and the upgrader
   replays EACH quadrant from its own stamp — so a handler that changes schemas in more
   than one quadrant fails the guard (when one quadrant is behind, staging its handler
   must not touch the other). Split it into one version per quadrant, and give each
   versioned quadrant its own resource in `createVersionUpgrader(versions, { document, settings })`.

## When a schema change makes a test fail — the fix is in the error

`assertVersionsMatchSchema` fails whenever the live schema no longer folds from the
history. Its message is a literal recipe. To fix it:

1. **Append one new entry** to the `versions` array with `version:` = the next index
   and the `changes` block the error printed verbatim.
2. **Set the `databaseVersion` resource `default`** to the new `currentVersion` the
   error names.
3. If the error marks a change **BREAKING — needs a handler**, add a `handler` to that
   entry (the error suggests the `remapStoreComponent(...)` call) AND add a matching
   test case under `testUpgradeHandlers` (rule 6).

Do exactly what the message says; do not touch existing entries.

## The two guard tests (keep both)

```ts
import { Database, storeSchemas, assertVersionsMatchSchema, testUpgradeHandlers } from "@adobe/data/ecs";
import { MainService } from "../main-service.js";
import { versions } from "./versions.js";

describe("database schema versions", () => {
  it("the version history matches the current schema", () => {
    const db = Database.create(MainService.plugin);
    assertVersionsMatchSchema({
      entries: versions,
      ...storeSchemas(db),
      versionResource: "databaseVersion",
      currentVersion: db.resources.databaseVersion,
    });
  });

  // Fails if any entry with a handler lacks a case. Add one per breaking change.
  it("every upgrade handler has a unit test", () => testUpgradeHandlers(versions, {
    // <version>: { setup: (store) => <populate the version-(v-1) store, return entities>,
    //              expect: (store, setup) => <assert the version-v result> },
  }));
});
```

## Example: a breaking change (number → object) at version 1

```ts
// versions.ts — append (do NOT edit version 0)
import { remapStoreComponent } from "@adobe/data/ecs";
const HealthObject = { type: "object", properties: { current: { type: "number", precision: 1, default: 0 }, max: { type: "number", precision: 1, default: 0 } } };
export const versions = [
  { version: 0, changes: { components: { /* …frozen… */ hp: { type: "number", precision: 1, default: 0 } } } },
  { version: 1,
    // MERGE patch: add the object shape, DELETE the number-only fields it drops.
    changes: { components: { hp: { type: "object", properties: HealthObject.properties, precision: undefined, default: undefined } } },
    handler: (store) => remapStoreComponent(store, "hp", HealthObject, (old: number) => ({ current: old, max: old })) },
];
// resources.ts — databaseVersion default becomes 1

// versions.test.ts — add the required case
testUpgradeHandlers(versions, {
  1: {
    setup: (store) => store.ensureArchetype(["hp"]).insert({ hp: 42 }),
    expect: (store, e) => expect(store.read(e)?.hp).toEqual({ current: 42, max: 42 }),
  },
});
```
