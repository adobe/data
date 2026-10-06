---
name: build-data
description: Build a feature's data/ layer — values, components, resources, entities. The first, foundational phase.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Create the feature's `data/` layer: pure Data declarations, depending only on
`@adobe/data` and the `data/` of features this one builds on.

- `values/<type>/` — one namespace per Data type: a hand-written type, a schema pinned
  to it (`type _Pin = Assert<Equal<Schema.ToType<typeof schema>, <Type>>>`) when
  something needs one, and pure helpers, each with a test.
- `components/<name>.ts` — one schema per file, scope spread from `Scope`, plus an
  `index.ts` barrel. Include implementation-only columns (tags, drag offsets).
- `resources/<name>.ts` — one schema per file, `satisfies ResourceSchema`, plus a barrel.
- `entities/<entity>.ts` — the spec-visible entity as a component-name tuple, with its
  type derived by `Database.EntityType`, plus a barrel.

Create only the folders the feature needs. Gate: it compiles and the helper tests
pass.

The how is in the auto-loading `features/data/` rules and `global/namespace.md`.
