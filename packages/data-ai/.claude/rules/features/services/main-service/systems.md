---
paths:
  - '**/features/*/services/main-service/system-database/**/*.ts'
---

# database/systems/ — the real-time tick loop

Systems are the framework's real-time backbone: functions the scheduler runs
**every frame**, in dependency order, to advance a simulation. A feature only
has a `systems/` folder when it is real-time (a game, a physics/particle sim).
Turn-based features never need one — they mutate through transactions on user
input and stop.

A system is a `SystemDeclaration` — `{ create, schedule?: { before?, after?, during? } }`.
`create` runs ONCE at construction (capture closures / query args); it returns the
per-frame function (or `void` for an init-only system, e.g. seeding the first
entities). Ordering lives under **`schedule`** (not top-level).

**Declare the `systems` map inline in `system-database.ts`.** The `create: (db) => …`
arrow must be written inline in `Plugin.create` for two reasons: only there is `db`
strongly typed (to the assembled plugin's database, with a **writable `store`**), and
a pre-typed standalone `create` reference breaks the scheduler's system-name inference
(the name union collapses to `never`, which then rejects every `schedule` entry). Keep
each `create` thin by delegating the real per-frame work to a pure `data/` step
function; if an ecs-specific body is substantial, extract it to a `systems/<name>.ts`
helper `(db) => () => void` (annotate its `db`) and call it from the inline `create`.

```ts
// in system-database.ts
import { Database, scheduler } from "@adobe/data/ecs";
import { Motion } from "../../data/motion/motion.js";

const plugin = Database.Plugin.create({
    // combine scheduler with the CURRENT TOP layer — ComputedDatabase here, but
    // ActionDatabase / ServiceDatabase if the feature built those (systems come last).
    extends: Database.Plugin.combine(ComputedDatabase.plugin, scheduler),
    systems: {
        control: { create: (db) => () => { /* input → ship; db.transactions.fireBullet() */ } },
        movement: {
            schedule: { after: ["control"], before: ["collision"] },
            create: (db) => () => {
                const dt = db.store.resources.frameDelta;
                for (const arch of db.store.queryArchetypes(["position", "velocity"])) {
                    const pos = arch.columns.position, vel = arch.columns.velocity;
                    for (let i = 0; i < arch.rowCount; i++) {
                        pos.set(i, Motion.advance(pos.get(i), vel.get(i), dt)); // in-place, no migration
                    }
                }
            },
        },
        collision: { schedule: { after: ["movement"] }, create: (db) => () => { /* … */ } },
    },
});
```

- **Systems mutate `db.store` directly** — that is the writable surface a system
  receives (unlike the readonly `.store` consumers get). In-place column writes
  (`col.set(i, …)`) for hot per-row work that stays in the same archetype;
  `db.store.update / insert / delete` for lifecycle (spawning, dying) that changes
  archetype membership. Resources: `db.store.resources.x = …`.
- **Dispatch a transaction for a discrete atomic event** — when the effect is a
  self-contained event that already has a conformant transaction (score a hit,
  lose a life, spawn a wave, fire a bullet), call `db.transactions.*` instead of
  re-implementing it: you reuse the `data/`-verified logic and observers (a reactive
  HUD) are notified. Reserve direct `db.store` writes for the hot per-row paths
  (movement, aging) that run on every entity every frame and shouldn't pay
  per-entity transaction overhead.
- **Optimize hot paths for speed.** With many entities, query with efficient
  `queryArchetypes` and read/write minimal columns directly; avoid intermediate
  allocations. On a hot path treat `data/` step functions as **spec only** — use
  them when the path isn't hot or you can't beat them by writing the store
  directly; off hot paths, reuse them freely. (Only transactions are observable —
  direct store writes fire no observers.)
- **Iterate archetypes per `archetypes.md`.** Express selection with
  `queryArchetypes(include, { exclude })`; when a system destroys/migrates rows
  (bullets expiring, entities dying) iterate **tail → head** so hole-fills don't
  invalidate the cursor. A per-frame system touching many rows is exactly where
  those rules pay off. **A `db.transactions.*` call mid-scan migrates rows too** —
  a transaction that inserts/deletes invalidates any live archetype cursor, so
  snapshot the ids you'll act on (or reverse-iterate) *before* dispatching
  transactions inside a per-frame loop.
- **Replicate the oracle's top-level guard in every system.** If the `data/`
  `step` opens with `if (isGameOver(state)) return state`, each split system must
  early-return on the same condition — a frozen frame is only a true no-op if
  *every* system honors the guard.
- **Index reads go through `db.indexes`** (plural) — the writable `db.store` a
  system receives is typed *without* its index handles, so a broad-phase query is
  `db.indexes.byCell.find({ cell })`, not `db.store.indexes.…`.
- **Ordering is declared under `schedule`, not implied.** `schedule.before` /
  `schedule.after` are hard constraints (name sibling systems); `schedule.during`
  is a soft same-tier hint. Systems with no ordering relation share a tier
  (conceptually parallel) — never rely on declaration order. When you split a
  monolithic `data/` `step` into several ordered systems, the schedule **must
  mirror the step's internal sequence** (advance → fire → age → collide → refill)
  — otherwise the tick diverges from the oracle even though each system is
  individually correct. Watch the subtle case: if a spawn step (fire) is followed
  by a step that also processes the just-spawned entity (the new bullet is aged
  and advanced this same tick), you can't advance *all* bodies in one system
  before the spawn — split that entity's advance out so it runs *after* the spawn,
  alongside the step that owns it.
- Immediate-mode rendering: store the canvas in a session resource and render to
  it inside a system (see @adobe/data-gpu for patterns).

## Driving the loop — the scheduler

Systems don't run themselves. Combine the built-in scheduler so they run on
`requestAnimationFrame`:

```ts
import { Database, scheduler } from "@adobe/data/ecs";
// in system-database.ts:
Database.Plugin.create({ extends: Database.Plugin.combine(ComputedDatabase.plugin, scheduler), systems });
```

The scheduler adds a `schedulerState` resource (`"running" | "paused" |
"disposed"`) — gate start/pause/resume through it (start `"paused"` if the game
begins on a user action). A headless host (tests, server sim) omits the
scheduler and drives frames itself by calling `db.system.functions[name]()` for
each `name` in `db.system.order` — so a simulation is fully runnable and testable
with no rAF and no rendering attached.

## Layer

`system-database.ts` extends the feature's **current top** main-service layer (`ActionDatabase` /
`ServiceDatabase` / `ComputedDatabase` — whichever it built; systems come last in the pipeline, so
they must sit atop any service/action layers, not a hardcoded `ComputedDatabase`), combined with
`scheduler`, and declares the `systems` map **inline** (see above —
this is the one facet not split one-per-file, because `create`'s `db` is only typed
inline and standalone declarations break name inference). A `systems/` folder is
optional: it holds extracted per-frame body helpers (`(db) => () => void`) only when
an inline body grows too large — the schedule and registration still live inline in
`system-database.ts`. The headless conformance test drives one frame via
`db.system.order` / `db.system.functions` and compares to the `data/` `step` oracle,
**reusing the feature projection** (`services/main-service/conformance.md`); it lives at
`system-database/tick-loop.test.ts`. Test **selection/detection** logic (which
entities collide, which pair resolves) separately, with seeded edge-case geometries
— it's a system concern, not a transaction, and where subtle bugs hide.

## Iterating archetype rows

A per-frame system reads/writes archetype columns directly. The row-iteration
rules — declarative `queryArchetypes` selection, tail → head migration, snapshot
avoidance — are general ECS concerns in the rules-root `archetypes.md`.
