# ecs memory

What the maintainers have decided about working on this package. These aren't derivable from the code. Add new
decisions about ecs here rather than in a personal memory, so every machine and developer has them.

## Interface

- **A minimal, abstract surface, as WebGPU's is.** Expose the smallest common surface that says what consumers mean,
  and nothing about how it's done, so the implementation stays free to change and optimize. Prefer what the build can
  derive over what consumers write; never expose a mechanism consumers could call instead of declaring intent, such
  as registration.
- **Agents write most consumer code; type errors guide them, editor affordances don't.** Spend effort on precise types
  and build errors, not on completions, editor plugins or other tooling only an IDE shows.
- **Humans own the interface, agents own the implementation** (`src/interface/CLAUDE.md`). Agents add or widen nothing
  public: no exported types, built-in components or resources, fields, options, union members or observable behaviour.
  Any change that can't be avoided is proposed for review before it lands.
- **Export a type only if a consumer would declare something with it.** Check the guide and samples; if they never name
  it, consumers infer it with `Parameters<>`, `ReturnType<>` or indexed access. Agents may remove such exports and say
  what they removed.
- **Report every contract change explicitly,** separately from implementation notes, including small ones: a new
  optional field, a removed helper, a change in errors, timing or read semantics.
- **Narrow the type, not the value.** Hiding an implementation detail narrows only the public type; the runtime value
  keeps its fields. Internal code recovers them with a runtime type guard, not casts or side tables. Never
  `Object.freeze` or `Object.seal`.
- **Interface first:** type changes with type tests shown red then green, then the runtime with runtime tests shown red
  then green, then docs.

## Performance

- **Choose by performance, not by effort or risk.** Compare options on big-O and measured results for common
  workloads. No estimates in days or weeks, and no ranking by implementation risk: the ECS has no clients yet and
  behaviour and performance tests catch regressions.
- **Every mechanism needs a benchmark proving its benefit,** or it's removed.
- **Record every dropped experiment** in `src/implementation/world/perf.md` under "Tried and not kept", with the
  measured result, why it didn't pay off, and what would make it worth revisiting, before reporting the drop.

## Threads and the loop

- **Joined threads, `main` above all, yield to their event loop at least once per tick** and never run synchronous work
  unbounded.
- **The default loop ticks once per `requestAnimationFrame`.**

## Direction

- **Reading and observing go through systems.** Consumers write plain observer systems, as the DOM work will; the
  `Observe<T>` pattern isn't offered to them, and a world has no observers. Observer factories built on observer
  systems with only the public API stay internal (`src/observe`), for tests, debugging and benchmarks, never exported.
- **Observing single entities is mainly for debugging.** Production reads, such as DOM bindings, are ordinary row
  systems over every matching row, which always beat one system per entity. Spend optimization effort on row systems
  and queries, and keep the entity factory correct and reasonably efficient.
- **One-off systems created at runtime aren't a large source of expected runtime;** regressions confined to them are
  acceptable.

## Repository

- **The ecs repository is the source of truth** for this package and its samples. adobe/data holds a copy of the
  repository at `ecs`, which a sync replaces, deleting what's gone; never edit it there.

## Checks

- **Check every package of the ecs repository:** the samples build and test against this package. Before a push,
  delete every `*.tsbuildinfo` under `packages`, then run `pnpm run build` (`tsc -b`, so it typechecks too) and
  `pnpm test` at the repository's root.

## Follow-ups

- **Open decisions and findings are tracked in `followups.md`.** Add new ones there, and remove an item once it's decided or done.
