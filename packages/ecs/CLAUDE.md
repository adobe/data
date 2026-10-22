# ecs

## Interface and implementation are separate

The ECS has two parts:

1. **The interface:** what consumers see and use, in `src/interface`.
2. **The implementation:** provided only by `World.create`, in `src/implementation`.

The interface exposes only what correct usage needs. Anything only the implementation needs stays out of it: out of
the exports, and out of the types of values the interface returns. For example, a system's type is its name and the
input consumers pass to `run`. Its components, resources, kernel and body are only for the implementation, so they
aren't in its type, though the value still holds them: narrowing a type doesn't mean changing the value.

Keeping the two apart leaves the implementation free to change how it stores, validates and runs things without
changing the interface.

Humans own the interface and agents own the implementation: agents don't add to or widen the public contract. See
`src/interface/CLAUDE.md`.

## Folders

- **`src/interface`** holds every public type, the registration functions with their registry and checks, and the runtime
  helpers declarations and bodies use (`Entity.schema`, the math functions and schemas, `Gpu.wgsl`, `Gpu.layout`).
  It's a project of its own: nothing in it imports from outside it. Each type exists once, there.
- **`src/implementation`** holds `createWorld` and everything behind it, the kernel compiler included. It imports
  types and the registry's read side from `src/interface`.
- **`src/samples`** holds one folder per sample, its page included; `pnpm sample` serves them.
- `src/index.ts` exports `src/interface`, and `World` as a value too, whose `create` and `join` are the
  implementation's, so `import { World } from "@adobe/ecs"` gives consumers the type, `World.create` and `World.join`,
  the only entry points. Samples and the guide use them; tests and benchmarks may take `createWorld` from
  `src/implementation` for its test hooks.
- `tsc -b` emits only into `dist`; delete any `.js` or `.d.ts` that appears beside sources.

## Naming

- **Archetypes count as types, so they're PascalCase:** `Todo`, and in a namespace `Report.Archetype`, not
  `Report.archetype`. Component and resource keys, indexes and systems are camelCase values.

## Real-time performance

The ECS runs every frame, so performance is a requirement, not a polish step, and it outranks every other concern:
when a measured win conflicts with a style or design preference, take the win and state the trade. Keep work per run, per system and per
row as low as it can be, and allocate nothing on those paths: reuse arrays, buffers and objects, share read-only
empties, and avoid closures, spreads and awaits there. Measure changes with `pnpm perf` against the recorded baseline.

## Memory

Decisions about working on this package live in `memory.md`; add new ones there.

@memory.md
