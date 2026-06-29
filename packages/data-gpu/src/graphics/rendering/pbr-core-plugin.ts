// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { U32 } from "@adobe/data/math";

/**
 * Ephemeral GPU mesh payloads shared between asset producers (glTF loader,
 * shape baker) and renderers. Not part of the authored asset model.
 */
export const pbrCore = Database.Plugin.create({
    components: {
        _vertexBuffer:                  { default: null as GPUBuffer | null, nonPersistent: true },
        /** Secondary VBO with skinning attributes (joints u32×4, weights f32×4),
         *  null for static primitives. Drives skinned-pipeline dispatch. */
        _skinVertexBuffer:              { default: null as GPUBuffer | null, nonPersistent: true },
        _indexBuffer:                   { default: null as GPUBuffer | null, nonPersistent: true },
        _indexCount:                    { ...U32.schema, nonPersistent: true },
        _indexFormat:                   { default: "uint16" as GPUIndexFormat, nonPersistent: true },
        _materialBindGroup:             { default: null as GPUBindGroup | null, nonPersistent: true },
        /** Back-reference from a _PbrPrimitive / _VisibleMaterial to the
         *  baked mesh asset that owns it. */
        _mesh:                          { ...Entity.schema, nonPersistent: true },
        _material:                      { ...Entity.schema, nonPersistent: true },
        /** Node-local-to-model-root matrix baked at load time. The renderer
         *  pre-multiplies it with the per-instance model-root world matrix. */
        _nodeLocalMatrix:               { ...Mat4x4.schema, nonPersistent: true },
        /** Skeleton-side back-references the renderer reads when dispatching
         *  the skinned pipeline. Populated by `pbrSkinning`. */
        _skeletonModelRef:              { ...Entity.schema, nonPersistent: true },
        _skeletonJointMatrixBindGroup:  { default: null as GPUBindGroup | null, nonPersistent: true },
    },
    archetypes: {
        _VisibleMaterial: ["nonPersistent", "_materialBindGroup", "_mesh"],
        _PbrPrimitive: ["nonPersistent", "_vertexBuffer", "_skinVertexBuffer", "_indexBuffer", "_indexCount", "_indexFormat", "_material", "_mesh", "_nodeLocalMatrix"],
    },
});
