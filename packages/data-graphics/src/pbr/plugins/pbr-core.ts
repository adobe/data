// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

/**
 * Data-only PBR plugin. Declares the component shape that any PBR renderer
 * consumes. No render system, no scene-uniforms dependency, no shader.
 *
 * The PbrPrimitive archetype includes `ephemeral`, which routes its entities
 * to the non-persisted location table — appropriate because every component
 * here is a GPU handle derived at runtime, not user-authored state.
 *
 * Pair with `pbrModelLoader` to load GLTF models and `pbrDirect` or `pbrIbl`
 * to actually draw entities.
 */
export const pbrCore = Database.Plugin.create({
    components: {
        pbrVertexBuffer: { default: null as unknown as GPUBuffer },
        pbrIndexBuffer: { default: null as unknown as GPUBuffer },
        pbrIndexCount: { default: 0 as number },
        pbrIndexFormat: { default: "uint16" as GPUIndexFormat },
        pbrMaterialBindGroup: { default: null as unknown as GPUBindGroup },
        pbrGeometryRef: { default: 0 as number },
    },
    archetypes: {
        PbrPrimitive: ["ephemeral", "pbrVertexBuffer", "pbrIndexBuffer", "pbrIndexCount", "pbrIndexFormat", "pbrMaterialBindGroup", "pbrGeometryRef"],
    },
});
