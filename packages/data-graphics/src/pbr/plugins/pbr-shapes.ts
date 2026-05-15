// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { graphics } from "../../plugins/graphics.js";
import { createMaterialBindGroupLayout } from "../bind-group-layouts.js";
import { createColorMaterial, type ColorMaterialOptions } from "../gltf/create-color-material.js";
import { createFallbackTextures } from "../gltf/decode-images.js";
import { createSphereBuffers } from "../gltf/create-sphere.js";
import { pbrCore } from "./pbr-core.js";

interface SphereSpec extends ColorMaterialOptions {
    rings: number;
    segments: number;
}

export const pbrShapes = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, graphics),
    components: {
        pbrSphereSpec: { default: null as unknown as SphereSpec },
    },
    archetypes: {
        Sphere: ["pbrSphereSpec"],
    },
    transactions: {
        insertSphere(t, options: ColorMaterialOptions & { rings?: number; segments?: number }): number {
            const spec: SphereSpec = {
                color: options.color,
                emissive: options.emissive,
                metallic: options.metallic,
                roughness: options.roughness,
                rings: options.rings ?? 32,
                segments: options.segments ?? 64,
            };
            return t.archetypes.Sphere.insert({ pbrSphereSpec: spec });
        },
        pbrInsertSphereGeometry(t, args: {
            pbrGeometryRef: number;
            pbrMaterialBindGroup: GPUBindGroup;
            pbrVertexBuffer: GPUBuffer;
            pbrIndexBuffer: GPUBuffer;
            pbrIndexCount: number;
            pbrIndexFormat: GPUIndexFormat;
        }) {
            const materialId = t.archetypes.PbrMaterial.insert({
                ephemeral: true,
                pbrMaterialBindGroup: args.pbrMaterialBindGroup,
                pbrGeometryRef: args.pbrGeometryRef,
            });
            t.archetypes.PbrPrimitive.insert({
                ephemeral: true,
                pbrGeometryRef: args.pbrGeometryRef,
                pbrMaterialRef: materialId,
                pbrVertexBuffer: args.pbrVertexBuffer,
                pbrIndexBuffer: args.pbrIndexBuffer,
                pbrIndexCount: args.pbrIndexCount,
                pbrIndexFormat: args.pbrIndexFormat,
            });
        },
    },
    systems: {
        pbrShapesSystem: {
            create: db => {
                const loaded = new Set<number>();
                let fallback: ReturnType<typeof createFallbackTextures> | null = null;
                let materialLayout: GPUBindGroupLayout | null = null;
                let sampler: GPUSampler | null = null;

                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;

                    if (!fallback) fallback = createFallbackTextures(device);
                    if (!materialLayout) materialLayout = createMaterialBindGroupLayout(device);
                    if (!sampler) sampler = device.createSampler({
                        magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
                    });

                    for (const arch of db.store.queryArchetypes(["pbrSphereSpec"])) {
                        const ids = arch.columns.id;
                        const specs = arch.columns.pbrSphereSpec;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i) as number;
                            if (loaded.has(id)) continue;
                            loaded.add(id);

                            const spec = specs.get(i) as SphereSpec;
                            const geo = createSphereBuffers(device, spec.rings, spec.segments);
                            const pbrMaterialBindGroup = createColorMaterial(
                                device, materialLayout, sampler, fallback, spec,
                            );
                            db.transactions.pbrInsertSphereGeometry({
                                pbrGeometryRef: id,
                                pbrMaterialBindGroup,
                                pbrVertexBuffer: geo.vertexBuffer,
                                pbrIndexBuffer: geo.indexBuffer,
                                pbrIndexCount: geo.indexCount,
                                pbrIndexFormat: geo.indexFormat,
                            });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
