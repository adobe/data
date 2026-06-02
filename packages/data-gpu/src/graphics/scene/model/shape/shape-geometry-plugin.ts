// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { pbrCore } from "../../../rendering/pbr-core-plugin.js";
import { core } from "../../../../core/core-plugin.js";
import { model } from "../model-plugin.js";
import { unitSphere, unitCube, type ShapeMesh } from "./shape-mesh.js";

/**
 * shapeGeometry — registers procedural unit-sphere and unit-cube geometries as
 * `Geometry` + `_PbrPrimitive` entities (StandardVertex layout), exactly like
 * the model loader does for glTF, so primitives and loaded models share one
 * render path. The two geometry entity ids are published in `_shapeGeometry`
 * for the physics render bridge to reference (sphere / cuboid bodies). Built
 * once when the device is ready.
 */
export const shapeGeometry = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, model, core),
    resources: {
        _shapeGeometry: { default: null as { sphere: Entity; cube: Entity } | null, transient: true },
    },
    transactions: {
        insertShapePrimitive(t, args: { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indexCount: number }): Entity {
            const geometry = t.archetypes.Geometry.insert({ modelUrl: "" });
            t.archetypes._PbrPrimitive.insert({
                ephemeral: true,
                _geometry: geometry,
                _material: 0,                 // primitives carry material per-instance, not here
                _vertexBuffer: args.vertexBuffer,
                _skinVertexBuffer: null,
                _indexBuffer: args.indexBuffer,
                _indexCount: args.indexCount,
                _indexFormat: "uint16",
                _nodeLocalMatrix: Mat4x4.identity,
            });
            return geometry;
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

                    const upload = (mesh: ShapeMesh): { vb: GPUBuffer; ib: GPUBuffer; count: number } => {
                        const vb = device.createBuffer({ size: mesh.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                        device.queue.writeBuffer(vb, 0, mesh.vertices);
                        const ib = device.createBuffer({ size: mesh.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
                        device.queue.writeBuffer(ib, 0, mesh.indices);
                        return { vb, ib, count: mesh.indices.length };
                    };

                    const s = upload(unitSphere());
                    const c = upload(unitCube());
                    const sphere = db.transactions.insertShapePrimitive({ vertexBuffer: s.vb, indexBuffer: s.ib, indexCount: s.count });
                    const cube = db.transactions.insertShapePrimitive({ vertexBuffer: c.vb, indexBuffer: c.ib, indexCount: c.count });
                    db.store.resources._shapeGeometry = { sphere, cube };
                    done = true;
                };
            },
        },
    },
});
