---
name: build-spec
description: Build a feature's spec/ — the State, its actions and derivations, and their cases. Test tier.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Create the feature's `spec/` folder, the specification the ECS will be conformed to:

- `state.ts` — `State` built from `data/` types (singletons named for resources,
  `ReadonlyMap` entity collections), pinned with `Conformance.StateMatches`; `create.ts`,
  `samples.ts`, `public.ts`.
- One file per **action** (each operation the app performs) and per **derivation**
  (each derived value it shows), each with its inert `*.cases.ts`. A real-time feature
  adds `systems.ts`: one pure function per ECS system it will have, named the same,
  each with cases, plus `noOp` states every system leaves unchanged.
- `transforms.ts` (the barrel of every action and derivation), `spec.ts`
  (`Conformance.spec`) and `spec.test.ts` (`Conformance.checkSpec`).

Build one action or derivation plus its cases at a time. Logic the ECS will share goes
into `data/values/` helpers, never here. Gate: `checkSpec` passes.

The how is in the auto-loading `features/spec/index.md` rule.
