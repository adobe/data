# data-ecs

## Interface and implementation are separate

The ECS has two parts:

1. **The interface:** what consumers see and use.
2. **The implementation:** provided only by `World.create`.

The interface exposes only what correct usage needs. Anything only the implementation needs stays out of it: out of
the exports, and out of the types of values the interface returns. For example, a system's type is its name and the
input consumers pass to `run`. Its components, resources, kernel and body are only for the implementation, so they
aren't in its type, though the value still holds them: narrowing a type doesn't mean changing the value.

Keeping the two apart leaves the implementation free to change how it stores, validates and runs things without
changing the interface.

## Real-time performance

The ECS runs every frame, so performance is a requirement, not a polish step. Keep work per run, per system and per
row as low as it can be, and allocate nothing on those paths: reuse arrays, buffers and objects, share read-only
empties, and avoid closures, spreads and awaits there. Measure changes with `pnpm perf` against the recorded baseline.
