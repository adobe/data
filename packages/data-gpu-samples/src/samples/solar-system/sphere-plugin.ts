// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { pbrCore, graphics, VisibleMaterial } from "@adobe/data-gpu";
import { createSphereBuffers } from "./create-sphere.js";

interface SphereSpec extends VisibleMaterial.ColorMaterialOptions {
    rings: number;
    segments: number;
}

/**
 * Sample-local plugin: lets the solar-system author `Sphere` entities with a
 * color/material spec. A system materializes each into the GPU primitives the
 * PBR renderer consumes, so the resulting entity id can be referenced as a
 * Model's `geometry`.
 */
export const sphere = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, graphics),
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
        _insertSphereGeometry(t, args: {
            geometry: number;
            materialBindGroup: GPUBindGroup;
            vertexBuffer: GPUBuffer;
            indexBuffer: GPUBuffer;
            indexCount: number;
            indexFormat: GPUIndexFormat;
        }) {
            const materialId = t.archetypes._VisibleMaterial.insert({
                ephemeral: true,
                _materialBindGroup: args.materialBindGroup,
                _geometry: args.geometry,
            });
            t.archetypes._PbrPrimitive.insert({
                ephemeral: true,
                _geometry: args.geometry,
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
                            db.transactions._insertSphereGeometry({
                                geometry: id,
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
