# Resources

A *resource* is a value a world holds once: a setting, a clock, a handle to an audio context, [declared](01-resources.ts#L14-L23)
in `Resources`.

A world starts each resource at the first of these that applies:

1. the value given to `World.create`, as [the moon](01-resources.ts#L30) gives `gravity`;
2. its `default` trait, a literal;
3. its type's namespace's `default`, as [`Height`](01-resources.ts#L11-L12) gives; every world shares that value, so
   it's read-only;
4. a reduction's identity ([Reductions](15-reductions.md)), `null` for a nullable type, the zero value (`0`, `false`,
   `""`, item by item), or an empty `ReadonlyMap` or `ReadonlySet` of each world's own.

Data, such as numbers, strings, tuples, structs, maps and sets, is held as a value: a system replaces it whole. A value
that isn't data, such as an `AudioContext`, is stored as it is; a change inside it is seen only once the resource is
written back. An `Entity` resource with no entity holds `Entity.none`, which is `0` rather than `null`, so it stays data
every thread can read.

A system reads resources by key. With `readonly: true` it only reads, and runs after the world's changes apply.
[`run`](01-resources.ts#L31-L32) runs a system once, and resolves to what the body returns, for a system without
components.
