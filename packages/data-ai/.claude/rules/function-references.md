---
paths:
  - 'packages/**/*.ts'
  - 'packages/**/*.tsx'
---

# Pass functions by reference — don't wrap them

When a value is already a function with the signature the callee wants, pass it
**by reference**. Never re-wrap it in an arrow that only forwards its arguments:

```ts
// ❌ identity wrappers — the arrow adds nothing
expectConforms({ spec: (s, dt) => State.resolveBulletHits(s, dt), apply: (store, a) => hitAsteroid(store, a) });
onClick={() => save()}
todos.map((t) => render(t))

// ✅ pass the function itself
expectConforms({ spec: State.resolveBulletHits, apply: hitAsteroid });
onClick={save}
todos.map(render)
```

Fewer parameters than the callee supplies is fine — extra args are ignored — so a
`(store) => void` transaction passes directly where `(store, args) => void` is
expected. Wrap **only** when the call genuinely *adapts*: drops or reorders args
(`(_state, bounds) => createInitial(bounds)`), reaches into one (`(s, a) =>
del(s, a.id)`), or supplies a captured value.

**The lone real exception — unbound methods.** A method pulled off a class type or
an unbound instance loses its `this` when passed bare, so it needs a wrapper (or
`.bind`). This is *exceptionally rare here*: everything in this codebase is pure
functions and closures — every database's `transactions` / `actions` / `computed`
and every `data/` helper is an already-bound standalone function. So before
reaching for a wrapper, confirm you're not just forwarding args.
