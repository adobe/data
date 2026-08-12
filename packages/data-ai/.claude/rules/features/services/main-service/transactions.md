---
paths:
  - '**/features/*/services/main-service/**/transactions/**/*.ts'
---

# database/transactions/ — atomic mutations

One mutation per file: a function taking the transaction store as its
first argument and pure `data/` args, returning `void`. It reads and
writes `t.resources` / entities; all its writes commit or roll back
together.

```ts
import { PlayMoveArgs } from "../../../data/play-move-args/play-move-args.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const playMove = (t: CoreDatabase.Store, { index }: PlayMoveArgs) => {
    // guard, then mutate t.resources / entities / archetypes
};
```

- Type the store parameter as `<Layer>.Store`: **`CoreDatabase.Store`** for a
  transaction that reads/writes entities, resources, or archetypes (the common
  case — all schema lives in `core-database`); **`IndexDatabase.Store`** the
  moment it reads an index. A store *is* the transaction context: it carries the
  index handles and the initiating `t.userId`. There is no separate
  transaction-context type.
- Keep transactions idempotent under replay where sync/P2P applies —
  validate and silently return on illegal or out-of-turn input rather
  than throwing.
- Decisions come from pure `data/` helpers; the transaction only applies the
  result — read the touched slice, call the `data/` transform, write the diff.
- Keep transaction files **single-export** (the `transactions/` barrel is
  `export *`-ed into the plugin facet, so a second export would pollute it).
- **ECS-based feature (no `data/state/`):** there are no conformance cases, so
  **every transaction carries its own unit test** — `Store.create(plugin)`, run the
  transaction, assert the resulting resources/entities/archetypes. That test is the
  direct substitute for the conformance oracle (see `../../index.md`, Two modes). The
  bullet below applies only to **state-based** features.
- **Conformance is wired once, centrally, and auto-paired** — not per-file. The
  feature's single `conformance/conformance.test.ts` `Conformance.runFeature({...})`
  call conforms transactions: it pulls them off **`plugin.transactions`** (the
  registered facet), pairs each to the **same-named** `data/state` transition, and
  conforms it — seed `fromState(before)`, apply, `Match.assert` `toState ≡ after`
  (state only; service effects are asserted through the action). There is **no**
  `define`/`conforms` adapter and **no** `covers` guard. A transaction taking
  **entity ids** takes them under the transition's own arg key (`{ id }`); the runner
  resolves each `entity(specId)` marker via the id→entity map `fromState` returns. A
  transaction with **no same-named transition** is infrastructure (`setInput`,
  `setBounds`) or the drag UI op (`dragTodo`) or system-dispatched — it is simply
  **skipped**, no guard needed. Don't add a per-item adapter for a renamed op; add a
  thin same-named transaction instead (see `conformance.md`).
- An `index.ts` barrel feeds the `transactions` plugin facet — so it must
  re-export **only** the mutations. A read/query helper shared by several
  transactions (`readShip`, `readBoard` — a `(t) => value` function) may live
  beside them in `transactions/`, but keep it **out of the barrel**, or it gets
  registered as a dispatchable transaction. (These are related helpers, so they
  belong here, not in a separate folder — `global/cohesion.md`'s peer-level caution
  doesn't apply.)
