// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { physicsData } from "../../../physics/physics-data-plugin.js";
import { ColliderShape } from "../../../physics/body/collider-shape/collider-shape.js";
import { model } from "../../scene/model/model-plugin.js";
import { shapeGeometry } from "../../scene/model/shape/shape-geometry-plugin.js";

/**
 * physicsRenderBridge — makes colliders renderable by `pbrRender`. Once the
 * shape geometries exist, every body with a collider shape (dynamic RigidBody
 * or immovable StaticCollider alike) gains a `geometry` ref (sphere / cube by
 * collider shape), a `scale` (its half-extents — the unit shapes are size-1),
 * and `visible`. Because physics `rotation`/`position` are the same components
 * the renderer reads, there is no per-frame sync: this only migrates new bodies.
 *
 * Also declares `Prop` — a render-only placed geometry with a material that is
 * not a physics body at all (decorative scenery with no collider).
 */
export const physicsRenderBridge = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, model, shapeGeometry),
    archetypes: {
        Prop: ["geometry", "position", "rotation", "scale", "visible", "material"],
    },
    systems: {
        physicsBridge: {
            schedule: { during: ["postUpdate"] },
            create: db => () => {
                const shapes = db.store.resources._shapeGeometry;
                if (!shapes) return;
                for (const arch of db.store.queryArchetypes(["colliderShape", "halfExtents"], { exclude: ["geometry"] })) {
                    const ids = arch.columns.id, css = arch.columns.colliderShape, hes = arch.columns.halfExtents;
                    // Tail→head: every visited body migrates out (gains geometry).
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const isBox = ColliderShape.toIndex(css.get(i)) === 1;
                        const he = hes.get(i);
                        const scale: [number, number, number] = isBox ? [he[0], he[1], he[2]] : [he[0], he[0], he[0]];
                        db.store.update(ids.get(i), {
                            geometry: isBox ? shapes.cube : shapes.sphere,
                            scale,
                            visible: true,
                        });
                    }
                }
            },
        },
    },
});
