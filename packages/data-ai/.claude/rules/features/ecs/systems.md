---
paths:
  - '**/features/*/ecs/systems/**/*.ts'
---

# ecs/systems/ — the real-time tick loop

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
each `create` thin by delegating math to pure `data/values/` helpers (never `spec/`);
if an ecs-specific body is substantial, extract it to a `systems/<name>.ts` helper
`(db) => () => void` (annotate its `db`) and call it from the inline `create`.

```ts
// in system-database.ts
import { Database, scheduler } from "@adobe/data/ecs";
import { Motion } from "../../data/values/motion/motion.js";

const plugin = Database.Plugin.create({
    // combine scheduler with the current top layer — ActionDatabase, since every
    // spec action has an action (systems come last).
    extends: Database.Plugin.combine(ActionDatabase.plugin, scheduler),
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
  self-contained event (score a hit, lose a life, spawn a wave, fire a bullet), call
  `db.transactions.*`: observers (a reactive HUD) are notified. Reserve direct `db.store` writes for the hot per-row paths
  (movement, aging) that run on every entity every frame and shouldn't pay
  per-entity transaction overhead.
- **Optimize hot paths for speed.** With many entities, query with efficient
  `queryArchetypes` and read/write minimal columns directly; avoid intermediate
  allocations. Never turn per-row work into per-entity transactions to make it
  conformable: `frame` conformance checks in-place writes as they are. (Only
  transactions are observable — direct store writes fire no observers.)
- **Iterate archetypes per `archetypes.md`.** Express selection with
  `queryArchetypes(include, { exclude })`; when a system destroys/migrates rows
  (bullets expiring, entities dying) iterate **tail → head** so hole-fills don't
  invalidate the cursor. A per-frame system touching many rows is exactly where
  those rules pay off. **A `db.transactions.*` call mid-scan migrates rows too** —
  a transaction that inserts/deletes invalidates any live archetype cursor, so
  snapshot the ids you'll act on (or reverse-iterate) *before* dispatching
  transactions inside a per-frame loop.
- **Every system guards itself** (e.g. early-return once the game is over), as its
  spec function does — a frozen frame is only a true no-op if *every* system honors
  the guard.
- **Index reads go through `db.indexes`** (plural) — the writable `db.store` a
  system receives is typed *without* its index handles, so a broad-phase query is
  `db.indexes.byCell.find({ cell })`, not `db.store.indexes.…`.
- **Ordering is declared under `schedule`, not implied.** `schedule.before` /
  `schedule.after` are hard constraints (name sibling systems); `schedule.during`
  is a soft same-tier hint. Systems with no ordering relation share a tier
  (conceptually parallel) — never rely on declaration order; systems sharing a tier
  must commute (conformance checks it). The schedule is the only statement of order:
  the spec never re-sequences systems, and frame conformance composes them in the
  order the schedule derives. Watch the subtle case: if a spawn (fire) is followed by
  a step that also processes the just-spawned entity (the new bullet is aged and
  advanced this same tick), you can't advance *all* bodies in one system before the
  spawn — split that entity's advance out so it runs *after* the spawn.
- Immediate-mode rendering: store the canvas in a session resource and render to
  it inside a system (see @adobe/data-gpu for patterns).

## Driving the loop — the scheduler

Systems don't run themselves. Combine the built-in scheduler so they run on
`requestAnimationFrame`:

```ts
import { Database, scheduler } from "@adobe/data/ecs";
// in system-database.ts:
Database.Plugin.create({ extends: Database.Plugin.combine(ActionDatabase.plugin, scheduler), systems });
```

The scheduler adds a `schedulerState` resource (`"running" | "paused" |
"disposed"`) — gate start/pause/resume through it (start `"paused"` if the game
begins on a user action). A headless host (tests, server sim) drives frames itself: for each tier in
`db.system.order` (an array of tiers), call `db.system.functions[name]()` for each
name, skipping `schedulerSystem` and init-only systems (no function). So a simulation
is fully runnable and testable with no rAF and no rendering attached.

## Layer

`system-database.ts` extends the feature's top ecs layer (`ActionDatabase`, since every spec
action has an action; systems come last in the pipeline), combined with
`scheduler`, and declares the `systems` map **inline** (see above —
this is the one facet not split one-per-file, because `create`'s `db` is only typed
inline and standalone declarations break name inference). Extracted per-frame body
helpers (`(db) => () => void`) sit beside it only when an inline body grows too large.

## Conformance

Each system has a same-named pure function in the spec's `systems` group
(`../spec/index.md`), and the implementation declares how frame args reach the store
and which systems the spec does not model (`conformance.md`):

```ts
frame: {
  args: { dt: (db, dt) => { db.store.resources.frameDelta = dt; },
          input: (db, input) => { db.store.resources.input = input; } },
  unmodelled: { physics: "wasm rigid-body step", seedLevel: "init-only" },
},
```

- **Per system:** each case seeds the store, writes the case's args, runs **just that
  system**, and compares with its spec function. Selection and detection logic (which
  entities collide) is tested here, with seeded edge-case geometries.
- **Per frame:** each frame case folds the spec system functions in `db.system.order`
  and also runs one real frame; both must give `after`. The order comes only from the
  `schedule` declarations.
- **Unmodelled systems** (wasm, init-only) are skipped on both sides and reported as
  skipped tests. Every system is modelled or unmodelled — a compile error otherwise.
  To test an unmodelled system's glue, put the wasm call behind a service and model it
  with a fake.

## Iterating archetype rows

A per-frame system reads/writes archetype columns directly. The row-iteration
rules — declarative `queryArchetypes` selection, tail → head migration, snapshot
avoidance — are general ECS concerns in the rules-root `archetypes.md`.
