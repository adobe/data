// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Column set shared by `StaticCollider`, `MeshCollider`, and `VoxelStaticCollider`. */
export const STATIC_COLLIDER_COMPONENTS = [
    "colliderShape",
    "halfExtents",
    "material",
    "position",
    "rotation",
] as const;
