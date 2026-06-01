// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { U32 } from "@adobe/data/math";

/**
 * Shape declarations shared between asset producers (model loader, shape
 * generators) and consumers (renderers). Every component and archetype is
 * ephemeral — not part of the user's data model. Pair with an asset
 * producer plus a renderer aggregator (`pbrIblRender`)
 * to get drawable scenes.
 */
export const pbrCore = Database.Plugin.create({
    components: {
        _vertexBuffer:                  { default: null as GPUBuffer | null },
        /** Secondary VBO with skinning attributes (joints u32×4, weights f32×4),
         *  null for static primitives. Drives skinned-pipeline dispatch. */
        _skinVertexBuffer:              { default: null as GPUBuffer | null },
        _indexBuffer:                   { default: null as GPUBuffer | null },
        _indexCount:                    U32.schema,
        _indexFormat:                   { default: "uint16" as GPUIndexFormat },
        _materialBindGroup:             { default: null as GPUBindGroup | null },
        /** Back-reference from a _PbrPrimitive / _VisibleMaterial to the
         *  authored Geometry that owns it. */
        _geometry:                      Entity.schema,
        _material:                      Entity.schema,
        /** Node-local-to-model-root matrix baked at load time. The renderer
         *  pre-multiplies it with the per-instance model-root world matrix. */
        _nodeLocalMatrix:               Mat4x4.schema,
        /** Skeleton-side back-references the renderer reads when dispatching
         *  the skinned pipeline. Populated by `pbrSkinning`. */
        _skeletonModelRef:              Entity.schema,
        _skeletonJointMatrixBindGroup:  { default: null as GPUBindGroup | null },
    },
    archetypes: {
        _VisibleMaterial: ["ephemeral", "_materialBindGroup", "_geometry"],
        _PbrPrimitive: ["ephemeral", "_vertexBuffer", "_skinVertexBuffer", "_indexBuffer", "_indexCount", "_indexFormat", "_material", "_geometry", "_nodeLocalMatrix"],
    },
});
