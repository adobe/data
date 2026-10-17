# data-ecs

## Interface and implementation are separate

The ECS has two parts:

1. **The interface:** what consumers see and use, in `src/types`.
2. **The implementation:** provided only by `World.create`, in `src/implementation`.

The interface exposes only what correct usage needs. Anything only the implementation needs stays out of it: out of
the exports, and out of the types of values the interface returns. For example, a system's type is its name and the
input consumers pass to `run`. Its components, resources, kernel and body are only for the implementation, so they
aren't in its type, though the value still holds them: narrowing a type doesn't mean changing the value.

Keeping the two apart leaves the implementation free to change how it stores, validates and runs things without
changing the interface.

## Folders

- **`src/types`** holds every public type, the registration functions with their registry and checks, and the runtime
  helpers declarations and bodies use (`Entity.schema`, the math functions and schemas, `Gpu.wgsl`, `Gpu.layout`).
  It's a project of its own: nothing in it imports from outside it. Each type exists once, there.
- **`src/implementation`** holds `createWorld` and everything behind it, the kernel compiler included. It imports
  types and the registry's read side from `src/types`.
- `src/index.ts` exports `src/types`. Tests, samples and benchmarks take `createWorld` from `src/implementation`.
- `tsc -b` emits only into `dist`; delete any `.js` or `.d.ts` that appears beside sources.

## Real-time performance

The ECS runs every frame, so performance is a requirement, not a polish step. Keep work per run, per system and per
row as low as it can be, and allocate nothing on those paths: reuse arrays, buffers and objects, share read-only
empties, and avoid closures, spreads and awaits there. Measure changes with `pnpm perf` against the recorded baseline.
