// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Line3 } from "@adobe/data/math";
import type { PhysicsHit } from "./physics-hit.js";

/**
 * The solver-agnostic spatial-query capability — the pluggable seam for
 * engine-backed picking. Whichever solver is active (`rapierSolver`,
 * `joltSolver`, …) publishes an implementation of this interface into the
 * `physicsQuery` resource once its world is live; consumers reach it through
 * the `pickRay` action (or read the resource directly for advanced use).
 *
 * `castRay` returns the nearest collider along the `Line3` segment, or `null`
 * for a miss. `castRayEach` visits *every* collider along the segment, nearest
 * first. `radius` (omitted / 0 → an infinitely-thin ray; > 0 → a sphere of that
 * radius swept along the segment) covers "pick along a line with or without
 * radius" behind one call. Both reference solvers back these with their native
 * ray / shape cast (Rapier `castRayAndGetNormal` / `castShape` /
 * `intersectionsWithRay`; Jolt `NarrowPhaseQuery.CastRay` / `CastShape` with
 * all-hit collectors).
 */
export interface PhysicsQuery {
    castRay(ray: Line3, options?: { radius?: number }): PhysicsHit | null;
    /**
     * Visit each collider crossed by the segment, **nearest first**, calling
     * `visit` once per crossing. Return `false` from `visit` to stop early (any
     * other return continues).
     *
     * Zero-allocation: `visit` receives a **single reused hit** that is valid
     * only for the duration of that call — read what you need (or copy fields
     * out); do not retain the object or its `point` / `normal` arrays past the
     * callback. (`castRay` returns a fresh, retainable hit; use it when you need
     * to keep one.)
     *
     * `radius > 0` sweeps a sphere: fully supported on solvers with a native
     * swept-shape all-hits query (Jolt); where the engine binding lacks one
     * (the Rapier compat binding), a radius query degrades to visiting only the
     * nearest hit. A thin ray (`radius` omitted / 0) visits all crossings on
     * every solver.
     */
    castRayEach(ray: Line3, visit: (hit: PhysicsHit) => boolean | void, options?: { radius?: number }): void;
}
