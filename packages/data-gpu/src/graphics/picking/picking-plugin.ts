// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Aabb, type Line3 } from "@adobe/data/math";
import { True } from "@adobe/data/schema";
import { Camera } from "../camera/camera.js";
import { screenToWorldRay } from "../camera/screen-to-world-ray.js";
import { worldBounds } from "../scene/model/world-bounds-plugin.js";
import type { PickHit } from "./pick-hit.js";

/**
 * Picking — ray-against-PickableModel hit testing.
 *
 * `PickableModel` extends `Model` with a `pickable` flag. The archetype
 * gives a clean opt-in: insert via `insertPickableModel` and the entity
 * participates in picking; plain `Model` entities are invisible to the
 * ray-caster.
 *
 * `pickRay(ray)` scans every visible PickableModel with a `_worldBounds`
 * column. `pickFromScreen({ x, y })` takes pixel coords (e.g. from
 * `offsetX` / `offsetY` on a pointer event), converts them to NDC
 * (Normalized Device Coordinates, x/y ∈ [-1, 1], origin at center),
 * then reconstructs the eye→cursor ray and delegates to `pickRay`.
 *
 * Exposed as **actions** (not transactions) because picks return a
 * `PickHit | null` value — transactions are restricted to `Entity | void`.
 *
 * Future: replace the linear scan with a `broadphase` resource of type
 * `Broadphase` exposing `queryRay(ray, cb)` and `queryAabb(box, cb)`.
 */

const pickingBase = Database.Plugin.create({
    extends: Database.Plugin.combine(worldBounds, Camera.plugin),
    components: {
        pickable: True.schema,
    },
    archetypes: {
        PickableModel: ["mesh", "position", "rotation", "scale", "visible", "parent", "pickable"],
    },
    transactions: {
        insertPickableModel(t, args: {
            mesh: number;
            position?: readonly [number, number, number];
            rotation?: readonly [number, number, number, number];
            scale?: readonly [number, number, number];
            parent?: number;
        }): number {
            return t.archetypes.PickableModel.insert({
                mesh:      args.mesh,
                position:  args.position ?? [0, 0, 0],
                rotation:  args.rotation ?? [0, 0, 0, 1],
                scale:     args.scale    ?? [1, 1, 1],
                visible:   true,
                parent:    args.parent   ?? 0,
                pickable:  true,
            });
        },
    },
});

// `picking` adds only actions (no new C/R/A), so the `db` passed to every
// action is structurally assignable to this type — full component typing
// with no `any`.
type PickingDB = Database.Plugin.ToDatabase<typeof pickingBase>;

const pickRayImpl = (db: PickingDB, ray: Line3): PickHit | null => {
    let best: PickHit | null = null;
    for (const arch of db.queryArchetypes([
        "mesh", "visible", "pickable", "_worldBounds",
    ])) {
        const ids    = arch.columns.id;
        const vis    = arch.columns.visible;
        const bounds = arch.columns._worldBounds;
        for (let i = 0; i < arch.rowCount; i++) {
            if (!vis.get(i)) continue;
            const alpha = Aabb.lineIntersection(bounds.get(i), ray);
            if (alpha < 0) continue;
            if (best === null || alpha < best.distance) {
                best = { entity: ids.get(i), distance: alpha };
            }
        }
    }
    return best;
};

export const picking = Database.Plugin.create({
    extends: pickingBase,
    actions: {
        pickRay(db, ray: Line3): PickHit | null {
            return pickRayImpl(db, ray);
        },
        pickFromScreen(db, args: { x: number; y: number }): PickHit | null {
            const cam    = db.resources.camera;
            const canvas = db.resources.canvas;
            if (!cam || !canvas) return null;
            // Convert pixel coords → NDC (x/y ∈ [-1, 1], origin at canvas center).
            const ray = screenToWorldRay(cam, args.x, args.y, canvas.width, canvas.height);
            return pickRayImpl(db, ray);
        },
    },
});
