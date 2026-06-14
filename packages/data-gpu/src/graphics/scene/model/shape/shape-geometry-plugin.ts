// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import type { Aabb } from "@adobe/data/math";
import { Mat4x4 } from "@adobe/data/math";
import { pbrCore } from "../../../rendering/pbr-core-plugin.js";
import { core } from "../../../../core/core-plugin.js";
import { mesh } from "../mesh-plugin.js";
import { unitSphere, unitCube } from "./shape-mesh.js";
import { uploadShapeMesh } from "./upload-shape-mesh.js";
import { boundsFromShapeMesh } from "./bounds-from-shape-mesh.js";
import { capsuleMesh, flatShadedMesh } from "./shape-mesh.js";
import { convexHullMesh } from "./convex-hull.js";
import type { ShapeSpec } from "./shape-spec.js";

/**
 * shapeGeometry — bakes built-in procedural meshes into `StaticMesh` + `_PbrPrimitive`
 * (StandardVertex layout). Registers shared unit sphere/cube at init; provides
 * `insertStaticMeshPrimitive` for direct bakes (capsule/hull caches, extensions, etc.).
 */
export const shapeGeometry = Database.Plugin.create({
    imports: Database.Plugin.combine(pbrCore, mesh),
    extends: core,
    resources: {
        _shapeMeshes: { default: null as { sphere: Entity; cube: Entity } | null, transient: true },
    },
    transactions: {
        insertStaticMeshPrimitive(t, args: {
            mesh?: Entity;
            vertexBuffer: GPUBuffer;
            indexBuffer: GPUBuffer;
            indexCount: number;
            localBounds: Aabb;
        }): Entity {
            const meshId = args.mesh ?? t.archetypes.StaticMesh.insert({ localBounds: args.localBounds });
            if (args.mesh !== undefined) {
                t.update(args.mesh, { localBounds: args.localBounds });
            }
            t.archetypes._PbrPrimitive.insert({
                ephemeral: true,
                _mesh: meshId,
                _material: 0,
                _vertexBuffer: args.vertexBuffer,
                _skinVertexBuffer: null,
                _indexBuffer: args.indexBuffer,
                _indexCount: args.indexCount,
                _indexFormat: "uint16",
                _nodeLocalMatrix: Mat4x4.identity,
            });
            return meshId;
        },
    },
    systems: {
        shapeGeometryInit: {
            schedule: { during: ["preUpdate"] },
            create: db => {
                let done = false;
                return () => {
                    if (done) return;
                    const { device } = db.store.resources;
                    if (!device) return;

                    const s = uploadShapeMesh(device, unitSphere());
                    const c = uploadShapeMesh(device, unitCube());
                    const sphere = db.transactions.insertStaticMeshPrimitive({
                        vertexBuffer: s.vb, indexBuffer: s.ib, indexCount: s.count,
                        localBounds: boundsFromShapeMesh(unitSphere()),
                    });
                    const cube = db.transactions.insertStaticMeshPrimitive({
                        vertexBuffer: c.vb, indexBuffer: c.ib, indexCount: c.count,
                        localBounds: boundsFromShapeMesh(unitCube()),
                    });
                    db.store.resources._shapeMeshes = { sphere, cube };
                    done = true;
                };
            },
        },
        shapeMeshBake: {
            schedule: { during: ["preUpdate"], after: ["shapeGeometryInit"] },
            create: db => {
                const bake = (spec: ShapeSpec): {
                    vb: GPUBuffer;
                    ib: GPUBuffer;
                    count: number;
                    localBounds: Aabb;
                } | null => {
                    const { device } = db.store.resources;
                    if (!device) return null;
                    if (spec.kind === "unitSphere") {
                        const data = unitSphere();
                        const gpu = uploadShapeMesh(device, data);
                        return { ...gpu, localBounds: boundsFromShapeMesh(data) };
                    }
                    if (spec.kind === "unitBox") {
                        const data = unitCube();
                        const gpu = uploadShapeMesh(device, data);
                        return { ...gpu, localBounds: boundsFromShapeMesh(data) };
                    }
                    if (spec.kind === "capsule") {
                        const data = capsuleMesh(spec.radius, spec.halfHeight);
                        const gpu = uploadShapeMesh(device, data);
                        return { ...gpu, localBounds: boundsFromShapeMesh(data) };
                    }
                    if (spec.kind === "convexHull") {
                        const data = convexHullMesh(spec.points);
                        const gpu = uploadShapeMesh(device, data);
                        return { ...gpu, localBounds: boundsFromShapeMesh(data) };
                    }
                    if (spec.kind === "triMesh") {
                        const data = flatShadedMesh(spec.positions, spec.indices);
                        const gpu = uploadShapeMesh(device, data);
                        return { ...gpu, localBounds: boundsFromShapeMesh(data) };
                    }
                    return null;
                };
                return () => {
                    for (const arch of db.store.queryArchetypes(["shapeSpec"])) {
                        const ids = arch.columns.id;
                        const specs = arch.columns.shapeSpec;
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const spec = specs.get(i);
                            if (!spec) continue;
                            const meshId = ids.get(i);
                            const baked = bake(spec);
                            if (!baked) continue;
                            db.transactions.insertStaticMeshPrimitive({
                                mesh: meshId,
                                vertexBuffer: baked.vb,
                                indexBuffer: baked.ib,
                                indexCount: baked.count,
                                localBounds: baked.localBounds,
                            });
                            db.store.update(meshId, { shapeSpec: null });
                        }
                    }
                };
            },
        },
    },
});
