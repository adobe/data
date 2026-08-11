# @adobe/data-testing

Conformance-testing utilities for `@adobe/data` ECS features — the `Match` and
`Conformance` namespaces used by the co-located conformance pattern (see
`@adobe/data-ai`'s `features/data/state.md` and
`features/services/main-service/conformance.md`).

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
// data/state/conformance-case.ts
import { Conformance as ConformanceApi } from "@adobe/data-testing";
import type { State } from "./state.js";

export type Conformance<F extends (...args: never[]) => unknown> = ConformanceApi.Cases<State, F>;
export const entity = ConformanceApi.entity;
```

```ts
// data/state/spec.test.ts
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import { transitions } from "./transitions.js";

Conformance.runSpec({ state: State, transitions });
```

`Match` provides tolerant, matcher-aware value comparison (`matches`, `ref`,
`anyNumber`, `anyString`) used by the `after` side of a conformance case.
`Conformance` provides the case types (`Cases`, `DerivationCases`, `Effects`)
and the runner drivers (`runSpec`, `runTransactions`, `runActions`,
`runComputeds`, `runFeature`) that drive vitest's `describe`/`it` against
spec-owned cases.
