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
- **Conformance is wired once, centrally** — not per-file.
  `conformance/transactions.test.ts` is a single `Conformance.runTransactions({
  createStore, fromState, toState, registered, covers?, define })` call: each
  `conforms(name, { cases, apply })` runs the transition's shared `data/state`
  cases against its transaction — the shared driver seeds `fromState(before)`,
  calls `apply(store, args, resolve)`, then `Match.assert`s `toState ≡ after` —
  with a coverage guard keyed off the registered barrel so none are missed (see
  `conformance.md`). A transaction taking **entity ids** resolves them with the
  driver's `resolve` (`resolve(args.id)`, from the seeded `id → entity` map); a
  differently-named or reused transaction (`dragTodo` ⇄ `reorderTodo`) just names
  the cases it reuses; an extra transaction with no `data/` analogue (`setBounds`,
  `setInput`) gets a direct `Match.assert` / resource check and is named in
  `covers` so the guard still counts it.
- An `index.ts` barrel feeds the `transactions` plugin facet — so it must
  re-export **only** the mutations. A read/query helper shared by several
  transactions (`readShip`, `readBoard` — a `(t) => value` function) may live
  beside them in `transactions/`, but keep it **out of the barrel**, or it gets
  registered as a dispatchable transaction. (These are related helpers, so they
  belong here, not in a separate folder — `global/cohesion.md`'s peer-level caution
  doesn't apply.)
