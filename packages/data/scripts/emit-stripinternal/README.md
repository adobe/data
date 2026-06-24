# Archetype rows under `stripInternal` — emit acceptance gate

An end-to-end check that a consumer which keeps its plugin **database type
`@internal`** can still expose archetype handles on a **hand-written public
service interface**, and that the emitted `.d.ts` is *self-contained*.

## Run

```sh
pnpm build           # or: tsc -b   (the fixture resolves @adobe/data/ecs to dist)
node scripts/emit-stripinternal/check.mjs
```

## Why this exists

When a consumer derives archetype types from the plugin **database** type
(`Database.Plugin.ToDatabase<typeof plugin>` / `Database.Archetype.RowOf`),
declaration emit breaks in one of two ways:

1. **Plugin db type referenced publicly → TS7056.** The emitter must serialize
   `typeof plugin` into the consumer's `.d.ts`, which overflows.
2. **Plugin db type `@internal` → dropped/dangling.** TypeScript never resolves
   a row *through* a stripped symbol; it preserves the reference, leaving a
   dangling `import type { … }` → downstream `TS2305`.

The fix is to resolve archetype rows from a small **public schema**
(`{ components, archetypes }`) instead of the plugin database type, via
[`ArchetypeRowOf` / `ArchetypeHandleOf`](../../src/ecs/store/archetype-row.ts).
The emitted type then references only public symbols.

## What the gate asserts

- The package `dist` exports `ArchetypeSchema` / `ArchetypeRowOf` / `ArchetypeHandleOf`.
- `fixture/` emits under `stripInternal: true` with **no TS7056**.
- `plugin.d.ts` strips the `@internal` plugin const and `SquirrelDatabase` type.
- `service.d.ts` declares `TrackService`, references **no** `@internal`/plugin
  symbol, and is small (no serialized plugin type).
- `consumer/` type-checks: `FromArchetype<service["archetypes"]["Track"]>`
  resolves to the **exact concrete columns** (mutual-assignability gate), with
  no dangling import.

## Authoring rules the fixture encodes (declaration-emit footguns)

These are TypeScript declaration-emit quirks observed while building this gate;
the fixture is shaped to avoid them, and `src/ecs/README.md` documents them for
consumers:

- **Reference the handle inline** in the interface (`ArchetypeHandleOf<typeof
  schema, "X">`), or import it with `import { type ArchetypeHandleOf }`. A pure
  `import type` alias reached through the package barrel and used only as a
  nested type argument can be elided.
- **Don't put fenced ` ```ts ` code blocks containing `import`/`export`/`interface`
  in JSDoc** immediately above an exported type — it can silently drop the
  following declaration.
- **Don't let the schema be the lone export** of a `stripInternal`-emitted
  module; pair it with another export (e.g. the `components` object) so the
  declaration survives emit.
