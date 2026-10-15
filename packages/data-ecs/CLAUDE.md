# data-ecs

## Interface and implementation are separate

The ECS has two parts:

1. **The interface:** what consumers see and use.
2. **The implementation:** provided only by `World.create`.

The interface exposes only what correct usage needs. Anything only the implementation needs stays out of it: out of
the exports, and out of the types of values the interface returns. For example, a system's type carries its name and
its input, because consumers order by the name and pass the input to `run`. Its components, resources, kernel and body
are for the implementation, which keeps them where it can reach them.

Keeping the two apart leaves the implementation free to change how it stores, validates and runs things without
changing the interface.
