---
paths:
  - '**/src/app/**/*.ts'
  - '**/src/app/**/*.tsx'
---

# src/app/ — the composition root

The app root composes the features. It is the only place that knows every feature,
and no feature imports it.

```
src/app/
  schema.ts            the app's composed plugin (when there are several features)
  versioning/          versions.ts + versions.test.ts (versioning.md)
  persistence.test.ts  a save/load round-trip, when the app persists
  *.test.ts            cross-feature tests (e.g. a todo op ignores a user id)
  main.ts              the entry: create the database, inject services, render
```

```ts
// schema.ts — main's full behavior, plus the schema of features that load lazily
const appSchemaPlugin = Database.Plugin.create({
  imports: AssignCoreDatabase.plugin,
  extends: MainService.plugin,
});
export namespace AppSchema {
  export const plugin = appSchemaPlugin;
}

// main.ts
const service = Database.create(AppSchema.plugin, {
  versioning: createVersionUpgrader(versions),
  services: { game },   // a service whose `create` throws until the app injects it
});
```

- **`imports`, not `extends`, for a lazily loaded feature**: the store knows its
  columns up front (its data persists and loads), while its behavior, types and code
  stay out until one of its elements connects and extends the database.
- **Inject every service whose `create` throws** at `Database.create`. Services can't
  be injected by a later `extend`.
- **Versioning** folds the whole persisted schema, so it lives here, built from
  `AppSchema.plugin`.
- A single-feature app needs no `schema.ts`; `main.ts` uses the feature's
  `MainService.plugin`.
