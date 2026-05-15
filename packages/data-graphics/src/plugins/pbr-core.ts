// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Mat4x4 } from "@adobe/data/math";

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
        pbrMaterialRef: { default: 0 as number },
        /** Node-local-to-model-root matrix baked at load time. The renderer
         *  pre-multiplies this with the per-instance model-root world matrix
         *  to build the effective GPU instance matrix. Identity for primitives
         *  whose node is at the model root (spheres, single-node models). */
        pbrNodeLocalMatrix: { default: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] as unknown as Mat4x4 },
    },
    archetypes: {
        PbrMaterial: ["ephemeral", "pbrMaterialBindGroup", "pbrGeometryRef"],
        PbrPrimitive: ["ephemeral", "pbrVertexBuffer", "pbrIndexBuffer", "pbrIndexCount", "pbrIndexFormat", "pbrMaterialRef", "pbrGeometryRef", "pbrNodeLocalMatrix"],
    },
});
