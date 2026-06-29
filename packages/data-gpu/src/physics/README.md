# Physics — feature roadmap

A general-purpose, solver-agnostic physics layer for `@adobe/data-gpu/physics`, suitable
for games, visualisation, and film/animation. Bodies are authored as ECS data
against a shared seam (`physicsData`); a pluggable **solver** (Jolt or Rapier)
advances them each frame. See `solvers/README.md` for choosing a solver.

```ts
import { physicsData, joltSolver, rapierSolver } from "@adobe/data-gpu/physics";
import { core } from "@adobe/data-gpu";
import { physicsRenderBridge } from "@adobe/data-gpu/graphics";

const scene = Database.Plugin.combine(core, physicsData, joltSolver, physicsRenderBridge);
```

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
- [x] **Per-bone colliders for skinned meshes** — `fitBoneCapsules` fits one
  capsule per bone from the skin (skinned meshes are excluded from the rigid
  auto-collider on purpose; they deform); `boneColliders` spawns a kinematic
  capsule per bone and tracks the animated skeleton (`jointWorldMatrix · offset`).
  Demo: the `ragdoll` sample (CesiumMan walk). Flipping to dynamic is next.
- [x] **Ragdoll controller + humanoid sample** — two backends behind the shared
  `ragdollTrigger`, shown side by side in the `ragdoll` sample (CesiumMan walks,
  then collapses onto the floor):
  - **`joltRagdoll`** (Jolt-native) — Jolt's `Skeleton`/`RagdollSettings`/`Ragdoll`
    with swing-twist limits + `DisableParentChildCollisions`; `DriveToPoseUsing-
    Kinematics` while alive, falls + `GetPose` readback when limp. Built into the
    solver's world via `_joltContext`. *Active ragdoll (`DriveToPoseUsingMotors`)
    + velocity-seeding from the last animated motion are easy follow-ups.*
  - **`boneColliders`** (generic) — our per-bone capsules + cone (Jolt) / free-ball
    (Rapier) joints; `kinematic→dynamic` flip + `reconcileRagdoll` (world↔local)
    so the skin flops. Runs on any solver. *Per-joint limit tuning is a follow-up.*
- [ ] **Collision events + groups/masks + sensors** — contact callbacks drained
  to ECS; per-body layer masks; overlap-only sensor colliders.
- [ ] **Spatial queries** — raycast / shape-cast / overlap against the broadphase
  (picking, line-of-sight, ground checks).
- [ ] **`uint32`-indexed primitives** — flat-shaded collider/render meshes
  currently emit `uint16` indices (fine for authored ramps/props, not dense
  terrain).
- [ ] **Deterministic headless joint tests** — the manual frame-stepping harness
  (used by the solver benchmark) mis-times joint formation against async WASM
  init, so joints are currently verified in-browser only. A proper harness
  (await solver-ready before inserting bodies/joints) would let us assert e.g.
  the cone clamp numerically.
- [ ] **Active ragdoll** — motorised joints driving toward the animation pose
  while dynamic (struck-but-recovers).
