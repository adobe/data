# @adobe/data-testing

Conformance-testing utilities for `@adobe/data` ECS features: the `Match` and
`Conformance` namespaces behind the spec ⇄ ECS conformance pattern (see
`@adobe/data-ai`'s `features/spec/index.md` and `features/ecs/conformance.md`).

This package exists separately from `@adobe/data` so that installing
`@adobe/data` never pulls in a `vitest` peer dependency — only projects that
actually author conformance tests (and therefore already depend on `vitest`)
need it.

## Install

```sh
pnpm add -D @adobe/data-testing vitest
```

## Usage

```ts
// spec/spec.ts — the pure spec: State, its actions and derivations, their cases
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },
  services: { analytics: AnalyticsService.createFake },
  cases: { createTodo, toggleComplete, visibleTodos },
});

// spec/spec.test.ts
Conformance.checkSpec(spec);

// ecs/conformance/implementation.ts — the spec paired with its ECS build
export const implementation = Conformance.implementation(spec, {
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
  hydrate: ["visibleTodos"],
});

// ecs/conformance/conformance.test.ts
Conformance.checkFeature(implementation);
```

- **`checkSpec`** runs every case against the pure spec functions. No ECS is built.
- **`checkFeature`** runs every case against the ECS:
  - each spec action against the same-named action;
  - each derivation against its computed;
  - a real-time `step` by driving one frame (the `frame` option).

  It also round-trips `State.samples` through the projection. A spec op with no
  implementation fails by name.
- **`Conformance.StateMatches<State, typeof resources, typeof components>`** pins a
  `State`'s keys to the feature's resource and component names.
- **`Match`** provides tolerant, matcher-aware comparison (`matches`, `ref`,
  `anyNumber`, `anyString`).
- The lower-level runners (`runActions`, `runComputeds`, `runTransactions`,
  `adaptCases`) remain for a feature that needs per-case ambient context.
