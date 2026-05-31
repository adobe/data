// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type ReadonlyStore } from "@adobe/data/ecs";
import { Aabb, type Line3 } from "@adobe/data/math";
import { Camera } from "../camera/camera.js";
import { screenToWorldRay } from "../camera/screen-to-world-ray.js";
import { worldBounds } from "../model/world-bounds-plugin.js";
import type { PickHit } from "./pick-hit.js";

/**
 * Picking — ray-against-Model hit testing.
 *
 * `pickRay(ray)` linear-scans every visible+pickable Model and tests the
 * ray against its `_worldBounds`. `pickFromNdc({ ndcX, ndcY })` reconstructs
 * the eye→cursor ray from `camera` + `canvas` resources and delegates.
 *
 * Exposed as **actions** (not transactions) because picks return a
 * `PickHit | null` value — transactions are restricted to `Entity | void`.
 *
 * Future: replace the linear scan with a `broadphase` resource of type
 * `Broadphase` exposing `queryRay(ray, cb)` and `queryAabb(box, cb)`. The
 * current implementation is the reference; a uniform-grid or BVH impl, or a
 * GPU-compute version adapted from the boids spatial grid in
 * `data-gpu-samples/boids/`, plugs in without changing these action
 * signatures. Callers reach for `service.actions.pickRay(ray)` either way.
 */

const pickRayImpl = (store: ReadonlyStore<any, any, any>, ray: Line3): PickHit | null => {
    let best: PickHit | null = null;
    for (const arch of store.queryArchetypes([
        "geometry", "visible", "pickable", "_worldBounds",
    ])) {
        const ids = arch.columns.id;
        const vis = arch.columns.visible;
        const pick = arch.columns.pickable;
        const bounds = arch.columns._worldBounds;
        for (let i = 0; i < arch.rowCount; i++) {
            if (!vis.get(i) || !pick.get(i)) continue;
            const alpha = Aabb.lineIntersection(bounds.get(i) as Aabb, ray);
            if (alpha < 0) continue;
            if (best === null || alpha < best.distance) {
                best = { entity: ids.get(i), distance: alpha };
            }
        }
    }
    return best;
};

export const picking = Database.Plugin.create({
    extends: Database.Plugin.combine(worldBounds, Camera.plugin),
    actions: {
        pickRay(db, ray: Line3): PickHit | null {
            return pickRayImpl(db, ray);
        },
        pickFromNdc(db, args: { ndcX: number; ndcY: number }): PickHit | null {
            const cam = db.resources.camera;
            const canvas = db.resources.canvas;
            if (!cam || !canvas) return null;
            const sx = (args.ndcX + 1) * 0.5 * canvas.width;
            const sy = (1 - args.ndcY) * 0.5 * canvas.height;
            const ray = screenToWorldRay(cam, sx, sy, canvas.width, canvas.height);
            return pickRayImpl(db, ray);
        },
    },
});
