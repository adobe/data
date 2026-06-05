# Physics — feature roadmap

A general-purpose, solver-agnostic physics layer for `@adobe/data-gpu`, suitable
for games, visualisation, and film/animation. Bodies are authored as ECS data
against a shared seam (`physicsData`); a pluggable **solver** (Jolt or Rapier)
advances them each frame. See `solvers/README.md` for choosing a solver.

This file is the running plan — check the box when a feature lands so we don't
lose track. Keep it honest about approximations and limitations.

## Done

- [x] **Pluggable solver seam** — `physicsData` + interchangeable `joltSolver` /
  `rapierSolver`; the same authored scene runs on either.
- [x] **Body types** — `static`, `dynamic`, `kinematic` (kinematic driven to its
  authored pose each step, pushing dynamics).
- [x] **Collider shapes** — `sphere`, `box`, `capsule`, convex `hull` (authored
  point cloud), static `mesh` (authored triangle soup).
- [x] **Fixed-timestep clock** (`physicsClock`, default 60 Hz, configurable) —
  sim rate decoupled from render rate, spiral-of-death capped.
- [x] **Render-rate interpolation** — a pre-render pass blends prev→current into
  the display pose (flat instances *and* the model `_worldMatrix` path).
- [x] **Auto-generated colliders from render geometry** — `ModelBody` /
  `StaticModelCollider` with `colliderShape: hull | mesh` and no collision data;
  generated from `collisionGeometry ?? geometry` (scale baked, cached). Manual
  colliders (authored `convexPoints` / `colliderMesh`) still work.
- [x] **Efficient mirroring** — tag+exclude sync (O(new)), `getTypedArray`
  write-back, reverse iteration on migrating loops.

- [x] **Joints / constraints** — `fixed`, `point` (ball), `hinge` (revolute +
  angle limits), `cone` (swing-twist: swing cone + twist range — anatomical
  ragdoll limits). Demo: a hanging chain + a cone-limited arm. *`cone` limits are
  full on Jolt; the Rapier compat binding has no cone constraint, so it
  approximates `cone` as a free `point` — use `joltSolver` for ragdoll limits.*

## Next

- [ ] **Convex decomposition** (e.g. V-HACD) for concave *dynamic* colliders.
  *Today a single auto-`hull` is a **convex approximation** — it fills
  concavities (a chair's legs merge). Static concave geometry should use
  `mesh`; concave dynamic bodies need decomposition into multiple hulls.*
- [ ] **Per-bone colliders for skinned meshes** — auto-fit capsules/boxes to a
  skeleton's bones (skinned meshes are excluded from the rigid auto-collider on
  purpose; they deform).
- [ ] **Ragdoll controller + humanoid sample** — per-bone bodies + joints with
  anatomical limits; bones `kinematic` (animation-driven) while alive, flip to
  `dynamic` on death/strike (joints + gravity flop, seeded from last animated
  velocity + impact). The hard part is the per-bone world↔local skeleton
  reconciliation. Lands an open-source rigged humanoid that ragdolls.
- [ ] **Collision events + groups/masks + sensors** — contact callbacks drained
  to ECS; per-body layer masks; overlap-only sensor colliders.
- [ ] **Spatial queries** — raycast / shape-cast / overlap against the broadphase
  (picking, line-of-sight, ground checks).
- [ ] **`uint32`-indexed primitives** — flat-shaded collider/render meshes
  currently emit `uint16` indices (fine for authored ramps/props, not dense
  terrain).
- [ ] **Active ragdoll** — motorised joints driving toward the animation pose
  while dynamic (struck-but-recovers).
