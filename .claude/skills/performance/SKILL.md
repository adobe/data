---
name: performance
description: Use when optimizing a hot path in @adobe/data — especially when an interface (Column, TypedBuffer, ManagedArray, etc.) has many concrete instances created from closure-returning factories and is dispatched from a tight per-row loop. Provides the closure→class refactor pattern, the V8 hidden-class reasoning behind it, accept/reject criteria, and the discipline that keeps the public API closure-free even when implementations are class-based.
---

# Closure→class refactor for hot dispatch sites

## The problem in 30 seconds

A factory shaped like this:

```ts
function createColumn(array) {
  return {
    get(i)    { return array[i]; },
    set(i, v) { array[i] = v; },
  };
}
```

…creates a **fresh hidden class plus fresh per-instance methods every call**. When a tight loop sees several such instances at the same call site (`positionX.get(i)`, `positionY.get(i)`, `velocityX.get(i)`, …), V8's inline cache goes polymorphic → megamorphic and the methods can't be inlined. Each `.get` call dereferences the closure context to read `array`. Same data flow, but the loop is 5× slower than it needs to be.

Replace with a class — `class Column { array; constructor(a) { this.array = a; } get(i) { return this.array[i]; } }` — and every instance shares one hidden class and one set of prototype methods. The IC monomorphizes, V8 inlines `.get`, and `array` becomes a fast property load.

## When to look for it

Three boxes must all be ticked:

1. **Many instances.** The factory is called once per column, once per archetype, once per buffer — not once per app.
2. **A hot per-row loop reads or writes through the returned object's methods.** ECS systems, render loops, serialization sweeps — anywhere the call count is `N × elements`.
3. **The call site sees more than one such instance.** `positionX.set(...); positionY.set(...); positionZ.set(...);` — three different receivers at the same `.set` IC.

If even one box is missing, leave the closure shape alone — it's clearer.

## When *not* to apply it

- One-off configs, plugin descriptors, options bags. The shape doesn't matter; clarity does.
- Cold paths: setup, teardown, migration, persistence. If it runs once per session, do not classify.
- Single-instance services where the call site only ever sees one shape — V8's IC is already monomorphic.
- Anywhere the closure carries non-trivial captured state that would feel awkward as a `private` field. Force-fitting state onto `this` for V8's benefit is the wrong trade if it harms readability.

## Refactor recipe

Mirror the existing precedents:

- `packages/data/src/cache/managed-array.ts` → `ManagedTypedArrayColumn`
- `packages/data/src/typed-buffer/create-number-buffer.ts` → `NumberTypedBuffer`

Specifically:

1. Methods go on the class body (so they live on the prototype, not on each instance).
2. State goes on `this`; **assign every field in the constructor** in the same order across all instances. Use `readonly` where the field never reassigns.
3. Pull internal helpers up as `private` methods, not nested closures or arrow-function fields. Arrow-function class fields go on each instance, not the prototype, and reintroduce the slow shape.
4. Don't add or delete properties after construction — that mutates the hidden class.
5. The factory function (`createXxx(...)`) stays exported and unchanged for callers; only the body is `return new XxxClass(...)`.
6. **Don't capture `this` in a closure that reassigns `this.<field>` — especially for fields read from a hot loop.** Even if the closure rarely runs, V8 escape-analyzes that `this.<field>` is externally mutable and refuses to inline reads of it. Compounded with a typed-array union and a few other fields, this can produce ~30-40× slowdowns on `column.get(i)` style loops despite identical-looking source. If the field genuinely needs to be reassigned by external code (e.g. WASM memory growth detaching a typed-array view), prefer an explicit `column.refresh()` method called by the orchestrator over a `this`-capturing callback. *Empirically confirmed in this repo: `ManagedTypedArrayColumn` (which registers `allocator.needsRefresh(() => { this.array = allocator.refresh(this.array) })` in its constructor) is **40× slower** than the equivalent `NumberTypedBuffer` (no such closure) on a per-element add sweep at N=1M, even though both classes share the same `get`/`set` shape. See `packages/data/src/perftest/typed-buffer-perf.ts` for the bisect test.*

## Public-API discipline

The interface stays a structural type — `Column<T>`, `TypedBuffer<T>`, `ManagedArray<T>`. Implementations may be classy; consumers must still see what looks like a plain interface object.

- **Don't export the class.** Module scope only. Export the factory and the type.
- **Don't add methods that aren't in the interface.** A consumer using public types must never need `instanceof MyClass`.
- **Don't lean on prototype tricks at the boundary.** Cloning, persistence, normalization, `JSON.stringify` — all should work whether the value is a class instance or a plain object.

This protects the data-oriented promise at the boundary. Inside the box: do whatever the profile says. At the box wall: a value is just data.

## Verifying the win

In order, three pieces:

1. **Focused micro-bench.** Use the perftest harness (`packages/data/src/perftest/perf-test.ts`) — call `test.run()` directly, with the harness's auto-tuned `N` and inner-loop sampling. Capture ms/iter before and after.
2. **Full perftest.** Run `packages/data/src/perftest/index.ts` in a headless Chromium against the local dist; check the relevant rows row-by-row. Confirm no regressions in unrelated rows.
3. **Optional sanity check.** Launch Chromium with `--js-flags="--allow-natives-syntax"` and `console.log(%HaveSameMap(positionX, velocityX))` — should be `true` after the refactor, `false` before.

**Reject thresholds.** Keep the change only if focused bench is **≥25% faster** *and* the relevant full-perftest row is **≥10% faster**, with `pnpm test` and `npx tsc -b` clean. Anything less is noise; revert.

## Things that are *not* this optimization

Don't conflate the closure→class fix with adjacent perf problems — they have different cures.

- **Per-element allocation in hot reads** (e.g. struct buffer's `get(i)` returning a fresh `{x,y,z}`). The cure is bulk APIs (`forEach`, `getInto(target, i)`) or operating on the underlying typed array directly, not class-ifying the readout. *Empirically confirmed: we benched a generated class for struct readout in this repo (`{x: f32, y: f32, z: f32}`, N=1M) and got 10.90 ms → 10.60 ms (−2.8%) — well below the 25% threshold. V8 already converges on a stable hidden class for object literals whose properties are assigned in fixed order, so the class buys nothing here. Don't re-try this without first changing the surface (e.g. a `getInto(target, i)` that mutates a caller-owned object, eliminating the allocation entirely).*
- **Polymorphic IC caused by mixed value types** (numbers and strings flowing through the same column). Cure: type-specialized columns.
- **Closure-captured bindings that get reassigned** (`array = allocator.refresh(array)` etc.). The hidden class is wrong from instance #1 — class form is correct independent of instance count.

## In-repo precedents

- `packages/data/src/cache/managed-array.ts` — `ManagedTypedArrayColumn`. Original case study; 5.4× on the focused profile, 30% on `ec2s:move column`.
- `packages/data/src/typed-buffer/create-number-buffer.ts` — `NumberTypedBuffer`. The `TypedBuffer` family (number, struct, const, enum, array) is uniformly class-based; that's the standard to follow.
- `packages/data/src/perftest/perf-test.ts` — harness with warmup + auto-tuned N + inner-loop sampling. Use it for any new benchmark.
