// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { physicsData } from "../../../physics/physics-data-plugin.js";
import { RIGID_BODY_COMPONENTS } from "../../../physics/rigid-body-components.js";
import { STATIC_COLLIDER_COMPONENTS } from "../../../physics/static-collider-components.js";
import { mesh } from "../../scene/model/mesh-plugin.js";
import { shapeGeometry } from "../../scene/model/shape/shape-geometry-plugin.js";
import { capsuleMesh, flatShadedMesh } from "../../scene/model/shape/shape-mesh.js";
import { convexHullMesh } from "../../scene/model/shape/convex-hull.js";
import { uploadShapeMesh } from "../../scene/model/shape/upload-shape-mesh.js";
import { boundsFromShapeMesh } from "../../scene/model/shape/bounds-from-shape-mesh.js";
import type { ColliderMesh } from "../../../physics/body/collider-mesh.js";
import { interpolation } from "../interpolation-plugin.js";

/** Authored column sets for primitive collider rows (RigidBody, ConvexBody,
 *  StaticCollider, MeshCollider). Query by these sets — not the named handle —
 *  so solver-tagged variants are found after migration. Rows with
 *  `voxelShapeName` are skipped at runtime (mechs voxel bodies). */
const PRIMITIVE_COLLIDER_QUERIES: readonly {
    include: readonly string[];
    exclude?: readonly string[];
}[] = [
    { include: RIGID_BODY_COMPONENTS, exclude: ["convexPoints"] },
    { include: [...RIGID_BODY_COMPONENTS, "convexPoints"] },
    { include: STATIC_COLLIDER_COMPONENTS, exclude: ["colliderMesh"] },
    { include: [...STATIC_COLLIDER_COMPONENTS, "colliderMesh"] },
];

const hasVoxelShapeName = (store: { read(id: Entity): Record<string, unknown> | null }, id: Entity): boolean =>
    store.read(id)?.voxelShapeName != null;

/**
 * physicsRenderBridge — assigns default primitive render meshes for standard
 * physics bodies whose visual is the collider primitive (RigidBody,
 * StaticCollider, ConvexBody, MeshCollider — including solver-tagged variants).
 * Collider shape
 * drives the mesh; bodies on other archetypes (e.g. `VoxelRigidBody`) are not
 * touched — their visual path owns `mesh` assignment separately.
 */
export const physicsRenderBridge = Database.Plugin.create({
    imports: Database.Plugin.combine(mesh, shapeGeometry, interpolation),
    extends: physicsData,
    systems: {
        physicsBridge: {
            // Runs late in postUpdate so voxel-owned bodies can resolve first;
            // name sorts after `voxelShapeVisualBridge` when both were postUpdate.
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
                    for (const { include, exclude } of PRIMITIVE_COLLIDER_QUERIES) {
                        for (const arch of db.store.queryArchetypes(
                            include as typeof RIGID_BODY_COMPONENTS,
                            exclude ? { exclude: exclude as ["convexPoints"] | ["colliderMesh"] } : undefined,
                        )) {
                            const ids = arch.columns.id;
                            const css = arch.columns.colliderShape;
                            const hes = arch.columns.halfExtents;
                            for (let i = arch.rowCount - 1; i >= 0; i--) {
                                const id = ids.get(i);
                                if (hasVoxelShapeName(db.store, id)) continue;
                                if (db.store.get(id, "mesh") != null) continue;
                                const shape = css.get(i);
                                const he = hes.get(i);
                                let meshId: Entity;
                                let scale: [number, number, number];
                                if (shape === "box") { meshId = shapes.cube; scale = [he[0], he[1], he[2]]; }
                                else if (shape === "capsule") { meshId = ensureCapsule(device, he[0], he[1]); scale = [1, 1, 1]; }
                                else if (shape === "hull") {
                                    const pts = db.store.get(id, "convexPoints");
                                    meshId = pts ? ensureHull(device, pts) : shapes.sphere;
                                    scale = [1, 1, 1];
                                } else if (shape === "mesh") {
                                    const cm = db.store.get(id, "colliderMesh");
                                    meshId = cm ? ensureTriMesh(device, cm) : shapes.cube;
                                    scale = [1, 1, 1];
                                } else { meshId = shapes.sphere; scale = [he[0], he[0], he[0]]; }
                                db.store.update(id, { mesh: meshId, scale, visible: true });
                            }
                        }
                    }
                };
            },
        },
    },
});
