# Traits, within and references

A declaration's fields are its *traits*. Besides `type` and `default`, these change what the world does with a
component:

- `reference: "owner"`: an `Entity` the holder belongs to. The holder is despawned with it.
- `reference: "weak"`: an `Entity` the holder points at. The component is removed when that entity despawns.
- `within: typeof selected`: the component is removed with `selected`.

[Here](11-traits.ts#L10-L21), deselecting the mothership removes its outline; destroying it despawns the entity it
owns and leaves the one targeting it without `target`. A row can't assign a reference; `commands.add` replaces it.

**Traits of your own** are members of `interface Traits<N>`, typed as the value each allows on key `N`, or `never`
where it doesn't apply. [`instanced`](11-traits.type-test.ts#L5-L10) applies only to components whose values are
lists of numbers. `Component.With<typeof instanced>` is the type of every key declared with it, so
[passing another](11-traits.type-test.ts#L21-L25) is a type error.
