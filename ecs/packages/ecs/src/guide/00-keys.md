# Keys and declarations

Every component and resource is a *key*: a `Symbol()` [bound at a module's top level](00-keys.ts#L5-L6).

- A symbol is unique, so keys from different libraries can't collide as strings can, and a minifier can't rename two
  into one.
- TypeScript types each `const` symbol as its own `unique symbol`, so the key itself can carry its value's type.

A *declaration* gives a key its type. [`declare module "@adobe/ecs"`](00-keys.ts#L8-L15) is TypeScript's module
augmentation: it merges your entries into the package's `Components`, `Resources` and `Traits` interfaces. That's what
types [`row[score]` and `resources[bonus]`](00-keys.ts#L22-L24) as numbers, with no generics anywhere.

A declaration's fields are its *traits*: `type`, `default`, and others that later chapters introduce, such as `reduce`
([Reductions](15-reductions.md)), `reference` and `within` ([Traits](11-traits.md)), `thread` ([Threads](19-threads.md))
and `shared` ([Shared components](20-shared.md)). A type named by `Schema.Type`, such as `F32` or `U32`, sets the stored
precision or width.

**What the build does.** `Compiler.plugin()` reads each declaration: it records the key with its schema, which the
package registers the first time it's needed, and gives the key an *id* from its package's name and version, its
module's path and its binding, such as `my-game@1.0.0/src/score.ts#score`. Threads, and a module evaluated again by hot
reload, agree on a key by its id ([Identity and ids](18-identity.md)).

**The rules**, and what breaking each gives:

- A key is a `Symbol()` constant at the top level of the module that declares it. A `Symbol.for` key, which the
  whole program shares, a well-known symbol, or a key made any other way fails the build: *a component's key score is
  a top-level `Symbol()` constant of this module*. So does declaring an imported key: *a component's key score is
  imported from "./keys.js": declare it in the module that declares the key*.
- A key used but not declared is TypeScript's error at each use, such as *Type 'symbol' is not assignable to type
  'never'* where a list names it, and the system naming it fails as its module loads:
  *System "award" uses component "score", which isn't a registered component: declare it beside its key, in interface
  Components or Resources.*
- A trait or default that doesn't hold makes every `World.create` call fail to type-check, naming the key and what's
  wrong.
