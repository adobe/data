// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

/**
 * Shape of an inserted PBR primitive. All five fields are GPU handles produced
 * by `loadGltfModel` — never authored by the user.
 */
export interface PbrPrimitiveInsert {
    pbrVertexBuffer: GPUBuffer;
    pbrIndexBuffer: GPUBuffer;
    pbrIndexCount: number;
    pbrIndexFormat: GPUIndexFormat;
    pbrMaterialBindGroup: GPUBindGroup;
}

/**
 * Data-only PBR plugin. Declares the component shape that any PBR renderer
 * consumes, plus the transaction that loaders call to spawn primitives. No
 * render system, no scene-uniforms dependency, no shader.
 *
 * The PbrPrimitive archetype includes `ephemeral`, which routes its entities
 * to the non-persisted location table — appropriate because every component
 * here is a GPU handle derived at runtime, not user-authored state.
 *
 * Pair with one of `pbrDirect` or (future) `pbrIbl` to actually draw entities.
 */
export const pbrCore = Database.Plugin.create({
    components: {
        pbrVertexBuffer: { default: null as unknown as GPUBuffer },
        pbrIndexBuffer: { default: null as unknown as GPUBuffer },
        pbrIndexCount: { default: 0 as number },
        pbrIndexFormat: { default: "uint16" as GPUIndexFormat },
        pbrMaterialBindGroup: { default: null as unknown as GPUBindGroup },
    },
    archetypes: {
        PbrPrimitive: ["ephemeral", "pbrVertexBuffer", "pbrIndexBuffer", "pbrIndexCount", "pbrIndexFormat", "pbrMaterialBindGroup"],
    },
    transactions: {
        pbrInsertPrimitives(t, primitives: readonly PbrPrimitiveInsert[]) {
            for (const p of primitives) {
                t.archetypes.PbrPrimitive.insert({ ephemeral: true, ...p });
            }
        },
    },
});
