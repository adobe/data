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
        /** Secondary VBO with skinning attributes (joints u32×4, weights f32×4),
         *  or null for static primitives. Presence drives skinned-pipeline
         *  dispatch in the renderer. */
        pbrSkinVertexBuffer: { default: null as GPUBuffer | null },
        pbrIndexBuffer: { default: null as unknown as GPUBuffer },
        pbrIndexCount: { default: 0 as number },
        pbrIndexFormat: { default: "uint16" as GPUIndexFormat },
        pbrMaterialBindGroup: { default: null as unknown as GPUBindGroup },
        pbrGeometryRef: { default: 0 as number },
        pbrMaterialRef: { default: 0 as number },
        /** Node-local-to-model-root matrix baked at load time. The renderer
         *  pre-multiplies this with the per-instance model-root world matrix
         *  to build the effective GPU instance matrix. Identity for primitives
         *  whose node is at the model root (spheres, single-node models) and
         *  for skinned primitives (the skin owns deformation). */
        pbrNodeLocalMatrix: { default: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] as unknown as Mat4x4 },
        // Renderer-visible skinning back-references. Set by the skinning plugin
        // when it instantiates a Skeleton; declared here so renderers can query
        // for them without depending on the skinning plugin itself. The bind
        // group has two read-only-storage bindings: 0 = per-Model instance
        // matrix, 1 = per-Model joint matrices. It binds at the renderer's
        // skinned-pipeline slot 3.
        skeletonModelRef: { default: 0 as number },
        skeletonJointMatrixBindGroup: { default: null as GPUBindGroup | null },
        /** Entity id of the Skeleton driving this Model. 0 until the skinning
         *  init system instantiates one (or forever, for non-skinned models). */
        animationSkeletonRef: { default: 0 as number },
    },
    archetypes: {
        PbrMaterial: ["ephemeral", "pbrMaterialBindGroup", "pbrGeometryRef"],
        PbrPrimitive: ["ephemeral", "pbrVertexBuffer", "pbrSkinVertexBuffer", "pbrIndexBuffer", "pbrIndexCount", "pbrIndexFormat", "pbrMaterialRef", "pbrGeometryRef", "pbrNodeLocalMatrix"],
    },
});
