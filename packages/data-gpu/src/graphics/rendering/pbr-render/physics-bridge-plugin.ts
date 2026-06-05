// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { physicsData } from "../../../physics/physics-data-plugin.js";
import { model } from "../../scene/model/model-plugin.js";
import { shapeGeometry } from "../../scene/model/shape/shape-geometry-plugin.js";
import { capsuleMesh, flatShadedMesh } from "../../scene/model/shape/shape-mesh.js";
import { convexHullMesh } from "../../scene/model/shape/convex-hull.js";
import { uploadShapeMesh } from "../../scene/model/shape/upload-shape-mesh.js";
import type { ColliderMesh } from "../../../physics/body/collider-mesh.js";
import { interpolation } from "../interpolation-plugin.js";

/**
 * physicsRenderBridge — makes colliders renderable by `pbrRender`. Once the
 * shape geometries exist, every body with a collider shape (dynamic RigidBody
 * or immovable StaticCollider alike) gains a `geometry` ref (sphere / cube by
 * collider shape), a `scale` (its half-extents — the unit shapes are size-1),
 * and `visible`. Because physics `rotation`/`position` are the same components
 * the renderer reads, there is no per-frame sync: this only migrates new bodies.
 *
 * It also folds in `interpolation`, so dynamic bodies render at the smooth,
 * render-rate display pose for free (the solver steps on a fixed clock that need
 * not match the render rate) — bridging physics to the renderer is exactly when
 * you want that. Use `interpolation` directly only with a custom (non-bridge) path.
 *
 * Also declares `Prop` — a render-only placed geometry with a material that is
 * not a physics body at all (decorative scenery with no collider).
 */
export const physicsRenderBridge = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, model, shapeGeometry, interpolation),
    archetypes: {
        Prop: ["geometry", "position", "rotation", "scale", "visible", "material"],
    },
    systems: {
        physicsBridge: {
            schedule: { during: ["postUpdate"] },
            create: db => {
                // Sphere/cube are unit meshes scaled by half-extents. A capsule can't
                // be non-uniformly scaled (its caps would distort), so it's built at its
                // real size and drawn at unit scale — one mesh per distinct (radius,
                // half-height), cached here (scenes use very few capsule sizes).
                const capsuleGeometry = new Map<string, Entity>();
                const ensureCapsule = (device: GPUDevice, r: number, hy: number): Entity => {
                    const key = `${r}:${hy}`;
                    let geo = capsuleGeometry.get(key);
                    if (geo === undefined) {
                        const m = uploadShapeMesh(device, capsuleMesh(r, hy));
                        geo = db.transactions.insertShapePrimitive({ vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count });
                        capsuleGeometry.set(key, geo);
                    }
                    return geo;
                };
                // Hull render mesh = triangulated convex hull of the point cloud, cached
                // by the point-array reference (bodies sharing a cloud share one mesh + draw).
                const hullGeometry = new Map<Float32Array, Entity>();
                const ensureHull = (device: GPUDevice, points: Float32Array): Entity => {
                    let geo = hullGeometry.get(points);
                    if (geo === undefined) {
                        const m = uploadShapeMesh(device, convexHullMesh(points));
                        geo = db.transactions.insertShapePrimitive({ vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count });
                        hullGeometry.set(points, geo);
                    }
                    return geo;
                };
                // Static-mesh render = flat-shaded triangle soup, cached by the colliderMesh ref.
                const meshGeometry = new Map<ColliderMesh, Entity>();
                const ensureMesh = (device: GPUDevice, cm: ColliderMesh): Entity => {
                    let geo = meshGeometry.get(cm);
                    if (geo === undefined) {
                        const m = uploadShapeMesh(device, flatShadedMesh(cm.positions, cm.indices));
                        geo = db.transactions.insertShapePrimitive({ vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count });
                        meshGeometry.set(cm, geo);
                    }
                    return geo;
                };
                return () => {
                    const shapes = db.store.resources._shapeGeometry;
                    const device = db.store.resources.device;
                    if (!shapes || !device) return;
                    for (const arch of db.store.queryArchetypes(["colliderShape", "halfExtents"], { exclude: ["geometry"] })) {
                        const ids = arch.columns.id, css = arch.columns.colliderShape, hes = arch.columns.halfExtents;
                        // Tail→head: every visited body migrates out (gains geometry).
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const id = ids.get(i), shape = css.get(i), he = hes.get(i);
                            // capsule + hull render at unit scale (their meshes are real-size);
                            // sphere/cube are unit meshes scaled by half-extents.
                            let geometry: Entity, scale: [number, number, number];
                            if (shape === "box") { geometry = shapes.cube; scale = [he[0], he[1], he[2]]; }
                            else if (shape === "capsule") { geometry = ensureCapsule(device, he[0], he[1]); scale = [1, 1, 1]; }
                            else if (shape === "hull") {
                                const pts = (db.store.read(id) as { convexPoints?: Float32Array | null }).convexPoints;
                                geometry = pts ? ensureHull(device, pts) : shapes.sphere;
                                scale = [1, 1, 1];
                            } else if (shape === "mesh") {
                                const cm = (db.store.read(id) as { colliderMesh?: ColliderMesh | null }).colliderMesh;
                                geometry = cm ? ensureMesh(device, cm) : shapes.cube;
                                scale = [1, 1, 1];
                            } else { geometry = shapes.sphere; scale = [he[0], he[0], he[0]]; }
                            db.store.update(id, { geometry, scale, visible: true });
                        }
                    }
                };
            },
        },
    },
});
