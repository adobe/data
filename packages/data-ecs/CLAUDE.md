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
