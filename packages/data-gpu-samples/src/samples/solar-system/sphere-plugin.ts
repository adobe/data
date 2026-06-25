// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { pbrCore, core, mesh, VisibleMaterial } from "@adobe/data-gpu";
import { createSphereBuffers } from "./create-sphere.js";

interface SphereSpec extends VisibleMaterial.ColorMaterialOptions {
    rings: number;
    segments: number;
}

const unitSphereBounds = {
    min: [-1, -1, -1] as const,
    max: [1, 1, 1] as const,
};

/**
 * Sample-local plugin: `Sphere` entities with a color/material spec bake into
 * `StaticMesh` + `_PbrPrimitive` for the IBL renderer.
 */
export const sphere = Database.Plugin.create({
    imports: Database.Plugin.combine(pbrCore, mesh),
    extends: core,
    components: {
        sphereSpec: { default: null as unknown as SphereSpec },
    },
    archetypes: {
        Sphere: ["sphereSpec"],
    },
    transactions: {
        insertSphere(t, options: VisibleMaterial.ColorMaterialOptions & { rings?: number; segments?: number }): number {
            const spec: SphereSpec = {
                color:     options.color,
                emissive:  options.emissive,
                metallic:  options.metallic,
                roughness: options.roughness,
                rings:     options.rings    ?? 32,
                segments:  options.segments ?? 64,
            };
            return t.archetypes.Sphere.insert({ sphereSpec: spec });
        },
        _insertSphereMesh(t, args: {
            mesh: number;
            materialBindGroup: GPUBindGroup;
            vertexBuffer: GPUBuffer;
            indexBuffer: GPUBuffer;
            indexCount: number;
            indexFormat: GPUIndexFormat;
        }) {
            t.update(args.mesh, { localBounds: unitSphereBounds });
            const materialId = t.archetypes._VisibleMaterial.insert({
                nonPersistent: true,
                _materialBindGroup: args.materialBindGroup,
                _mesh: args.mesh,
            });
            t.archetypes._PbrPrimitive.insert({
                nonPersistent: true,
                _mesh: args.mesh,
                _material: materialId,
                _vertexBuffer: args.vertexBuffer,
                _skinVertexBuffer: null,
                _indexBuffer: args.indexBuffer,
                _indexCount: args.indexCount,
                _indexFormat: args.indexFormat,
                _nodeLocalMatrix: Mat4x4.identity,
            });
        },
    },
    systems: {
        _sphereGenerateSystem: {
            create: db => {
                const built = new Set<number>();
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    for (const arch of db.store.queryArchetypes(["sphereSpec"])) {
                        const ids = arch.columns.id;
                        const specs = arch.columns.sphereSpec;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i) as number;
                            if (built.has(id)) continue;
                            built.add(id);

                            const spec = specs.get(i) as SphereSpec;
                            const geo = createSphereBuffers(device, spec.rings, spec.segments);
                            const materialBindGroup = VisibleMaterial.createColorBindGroup(device, spec);
                            db.transactions._insertSphereMesh({
                                mesh: id,
                                materialBindGroup,
                                vertexBuffer: geo.vertexBuffer,
                                indexBuffer: geo.indexBuffer,
                                indexCount: geo.indexCount,
                                indexFormat: geo.indexFormat,
                            });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
