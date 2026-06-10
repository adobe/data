# CLAUDE.md — data-gpu

## Hot-loop performance: direct typed-array column access in systems

Per-frame systems (the physics solver, the renderers, anything in `update`/
`physics`/`render`) run over every body/instance every frame. In those loops,
**never use `column.get(i)` / `column.set(i, v)` for `Vec3`/`Quat`/struct
columns** — `get` allocates a fresh array per call, so a few-hundred-element
loop churns thousands of short-lived arrays/frame and the GC stalls show up as
frame hitches.

Instead:

- **Read/write the backing memory directly.** Struct columns (`Vec3`, `Quat`,
  any fixed-array/object schema) are flat `Float32Array` buffers. Hoist the
  array once per archetype and index it: `Vec3` stride 3, `Quat` stride 4.

  ```ts
  const posArr = arch.columns.position.getTypedArray();   // not column.get(i)
  for (let i = 0; i < arch.rowCount; i++) {
      const o = i * 3;
      state.pos[o] = posArr[o]; state.pos[o + 1] = posArr[o + 1]; state.pos[o + 2] = posArr[o + 2];
  }
  ```

- **Systems may write component columns directly — no transaction.**
  Transactions are for authored edits / undo / sync; a per-frame solver writing
  its own derived state writes the typed array directly (zero transaction
  overhead, and `column.set` does no change-notification anyway).

- **Keep per-element math allocation-free.** Helpers called per row take an
  out-array + offset and write into it (return scalars), rather than returning
  a fresh `{...}` / `[...]`. See `ColliderShape.massProperties` (writes inverse
  inertia into the solver array) and `composeTrs` in `pbr-render-plugin` (writes
  a TRS matrix into a pooled arena). Reuse scratch buffers across frames; grow,
  never reallocate per frame.

Worked examples: the CPU solver gather/scatter (`cpu-xpbd-plugin.ts`) and the
primitive instance packing (`pbr-render-plugin.ts`) — both are zero-allocation
in steady state.

(For the orthogonal "closure → class for V8 hidden classes" optimization on the
`@adobe/data` buffer interfaces, see the `performance` skill.)

## ECS traversal: select in the query, never iterate rows you'll skip

When writing **any** system, before the loop ask: *which rows do I actually need
this frame, and does the query already exclude the rest?* Iterating a wide set
and `if`-skipping inside the loop is the recurring perf bug. The cost is
invisible at tens of rows and dominant at thousands (see the worked numbers
below), so make the query do the filtering. (`.claude/rules/archetypes.md` is
the canonical rule; this is the data-gpu-specific checklist.)

- **Push selection into `queryArchetypes(include, { exclude })`.** Require the
  components you read; exclude the ones that disqualify a row. Don't query a
  superset and filter. Distinguish by *archetype shape*, not by a per-row value
  test, wherever you can: e.g. `StaticCollider` has no velocity columns, so the
  dynamic gather/writeback simply never matches statics — no `if (isStatic)`.

- **Process-once work → tag + exclude.** If a system does one-time setup per
  entity (mirroring a body into an external engine, deriving `_worldBounds`,
  uploading a buffer), add a private `_`-prefixed **`True` tag** when done and
  `exclude` it from the query. Steady state then matches **zero archetypes** and
  iterates nothing, instead of re-scanning every entity every frame to re-skip
  it. Worked example: the Rapier/Jolt solver sync (`_rapierBody` / `_joltBody`).
  Measured at 20k static + 64 dynamic: Jolt **0.53 → 0.07 ms/frame** (the scan
  *was* the whole per-frame cost), Rapier **1.51 → 1.13**.

- **Iterate tail→head when every visited row migrates out.** Adding/removing a
  component (`db.store.update(id, { _tag: … })`, delete) migrates the row to
  another archetype; doing it mid-iteration triggers a hole-fill (tail row moved
  into the gap). Forward iteration pays that on every row and invalidates
  indices ahead; `for (let r = rowCount - 1; r >= 0; r--)` removes only the tail,
  so unvisited rows stay put. (See `world-bounds-plugin`, `transform-plugin`.)

- **`getTypedArray()` for the hot path; `column.get()` for cold migrating loops.**
  The every-frame path (e.g. solver writeback over all dynamics) reads/writes the
  backing `Float32Array` directly — no allocation (see the hot-loop section
  above). But a loop that **migrates rows as it goes** (the tag-on-completion
  pattern) must NOT hold a hoisted `getTypedArray()` across the migration — the
  buffer can move. Such loops run only over *new* rows (cold), so use
  `column.get()` there: robust to the migration, and the small per-row
  allocation is amortized to once-per-entity-lifetime.

## Mirroring ECS state to an external engine (WASM physics, GPU, …)

Each frame: (1) **sync** new entities into the engine — tag+exclude as above so
this is O(new), not O(all); (2) step the engine; (3) **write back** only the
subset that changed (e.g. dynamics — never statics) straight into the columns
via `getTypedArray()`. Copy *into* the engine and *back* through typed-array
indexing, not per-row object literals.

Residual to watch: the **read-back from the engine** is bounded by the engine's
JS binding. Some (e.g. `rapier3d-compat`) allocate a fresh `{x,y,z}` per getter
call — a few allocations per moving body per frame. It scales with the *moving*
count only; if that grows large, drop to the engine's raw/flat-buffer bindings
to read straight into the typed arrays. Flagged at the call site in
`rapier-solver-plugin.ts`.
