// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { physicsData } from "../../../physics/physics-data-plugin.js";
import { mesh } from "../../scene/model/mesh-plugin.js";
import { shapeGeometry } from "../../scene/model/shape/shape-geometry-plugin.js";
import { capsuleMesh, flatShadedMesh } from "../../scene/model/shape/shape-mesh.js";
import { convexHullMesh } from "../../scene/model/shape/convex-hull.js";
import { uploadShapeMesh } from "../../scene/model/shape/upload-shape-mesh.js";
import { boundsFromShapeMesh } from "../../scene/model/shape/bounds-from-shape-mesh.js";
import type { ColliderMesh } from "../../../physics/body/collider-mesh.js";
import { interpolation } from "../interpolation-plugin.js";

/**
 * physicsRenderBridge — makes colliders renderable by `pbrFactorRender`. Once
 * shared shape meshes exist, every body with a collider shape gains a `mesh`
 * ref, a `scale`, and `visible`. Dynamic bodies also get render interpolation.
 */
export const physicsRenderBridge = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, mesh, shapeGeometry, interpolation),
    systems: {
        physicsBridge: {
            schedule: { during: ["postUpdate"] },
            create: db => {
                const capsuleMeshes = new Map<string, Entity>();
                const ensureCapsule = (device: GPUDevice, r: number, hy: number): Entity => {
                    const key = `${r}:${hy}`;
                    let id = capsuleMeshes.get(key);
                    if (id === undefined) {
                        const data = capsuleMesh(r, hy);
                        const m = uploadShapeMesh(device, data);
                        id = db.transactions.insertStaticMeshPrimitive({
                            vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count,
                            localBounds: boundsFromShapeMesh(data),
                        });
                        capsuleMeshes.set(key, id);
                    }
                    return id;
                };
                const hullMeshes = new Map<Float32Array, Entity>();
                const ensureHull = (device: GPUDevice, points: Float32Array): Entity => {
                    let id = hullMeshes.get(points);
                    if (id === undefined) {
                        const data = convexHullMesh(points);
                        const m = uploadShapeMesh(device, data);
                        id = db.transactions.insertStaticMeshPrimitive({
                            vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count,
                            localBounds: boundsFromShapeMesh(data),
                        });
                        hullMeshes.set(points, id);
                    }
                    return id;
                };
                const triMeshes = new Map<ColliderMesh, Entity>();
                const ensureTriMesh = (device: GPUDevice, cm: ColliderMesh): Entity => {
                    let id = triMeshes.get(cm);
                    if (id === undefined) {
                        const data = flatShadedMesh(cm.positions, cm.indices);
                        const m = uploadShapeMesh(device, data);
                        id = db.transactions.insertStaticMeshPrimitive({
                            vertexBuffer: m.vb, indexBuffer: m.ib, indexCount: m.count,
                            localBounds: boundsFromShapeMesh(data),
                        });
                        triMeshes.set(cm, id);
                    }
                    return id;
                };
                return () => {
                    const shapes = db.store.resources._shapeMeshes;
                    const device = db.store.resources.device;
                    if (!shapes || !device) return;
                    for (const arch of db.store.queryArchetypes(["colliderShape", "halfExtents"], { exclude: ["mesh"] })) {
                        const ids = arch.columns.id, css = arch.columns.colliderShape, hes = arch.columns.halfExtents;
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const id = ids.get(i), shape = css.get(i), he = hes.get(i);
                            if ((db.store.read(id) as { voxelShape?: Entity }).voxelShape != null) continue;
                            let meshId: Entity, scale: [number, number, number];
                            if (shape === "box") { meshId = shapes.cube; scale = [he[0], he[1], he[2]]; }
                            else if (shape === "capsule") { meshId = ensureCapsule(device, he[0], he[1]); scale = [1, 1, 1]; }
                            else if (shape === "hull") {
                                const pts = (db.store.read(id) as { convexPoints?: Float32Array | null }).convexPoints;
                                meshId = pts ? ensureHull(device, pts) : shapes.sphere;
                                scale = [1, 1, 1];
                            } else if (shape === "mesh") {
                                const cm = (db.store.read(id) as { colliderMesh?: ColliderMesh | null }).colliderMesh;
                                meshId = cm ? ensureTriMesh(device, cm) : shapes.cube;
                                scale = [1, 1, 1];
                            } else { meshId = shapes.sphere; scale = [he[0], he[0], he[0]]; }
                            db.store.update(id, { mesh: meshId, scale, visible: true });
                        }
                    }
                };
            },
        },
    },
});
