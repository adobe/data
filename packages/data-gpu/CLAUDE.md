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
