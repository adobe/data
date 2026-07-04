# Physics solvers

Rigid-body solvers that plug into the shared `physicsData` seam. A solver reads
the authored `RigidBody` + `StaticCollider` components and writes back
`position`/`rotation`/velocity for dynamic bodies each frame, so the **same
scene runs unchanged on any solver** (`Database.Plugin.combine(scene, solver)`).

Two production-grade solvers ship, both compiled to WASM and wired identically:

```ts
import { joltSolver, rapierSolver } from "@adobe/data-gpu/physics";
```

| solver | engine | license |
| --- | --- | --- |
| `joltSolver` | Jolt Physics (Jorrit Rouwe) | MIT |
| `rapierSolver` | Rapier (dimforge) | Apache-2.0 |

Both are **opt-in**: the engine packages are regular dependencies, but with
`sideEffects: false` a bundler tree-shakes the solver (and its WASM) out unless
you actually import it. (The from-scratch CPU-XPBD solver was removed — it was
~10–15× slower and unstable on dense piles; these engines supersede it.)

## Which to use

**Default to `joltSolver`.** It's the most stable, it sleeps inert bodies (so
"many static, few dynamic" scenes cost almost nothing), and it handles deep/dense
stacks cleanly.

**Choose `rapierSolver` only when** the scene is dominated by *many
simultaneously-active dynamic bodies* most of the time **and** tight stability
isn't critical — that's the one regime where Rapier's per-step dynamic
throughput wins.

## Measured baseline

Headless harness (`runSolverBenchmark`), fixed 1/60 s timestep. Stability shown
as end-state mean height / peak speed (a tight settle is low/low).

**256 mixed dynamic bodies dropped into a walled bin (300 frames):**

| solver | ms/frame | sim-fps | stability (avgY · maxV) |
| --- | --- | --- | --- |
| `rapierSolver` | **0.90** | 1117 | −1.3 · 57 |
| `joltSolver` | 1.57 | 638 | **−0.4 · 47** (tighter) |

→ Rapier ~1.7× faster on a busy dynamic pile; Jolt settles tighter.

**8000 static + 64 dynamic (the "many static, few dynamic" target):**

| solver | ms/frame |
| --- | --- |
| `joltSolver` | **0.196** |
| `rapierSolver` | 0.344 |

→ Jolt ~1.75× faster — it sleeps the inert statics to near-zero step cost.

Reproduce / track regressions: `npx vitest --run
src/physics/solvers/rapier-jolt.benchmark.test.ts`. Numbers are post the
sync tag-exclude optimization (see this package's `CLAUDE.md`).

## Adding another solver

Implement the seam: extend `combine(physicsData, core)`, mirror new bodies into
the engine in the `physics` phase (tag + `exclude` so the sync is O(new) — see
the existing plugins and `CLAUDE.md`), step, and write the dynamic transforms
back via `getTypedArray()`. Benchmark it through `runSolverBenchmark` to compare.
