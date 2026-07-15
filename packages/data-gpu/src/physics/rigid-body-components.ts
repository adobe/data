// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Column set shared by `RigidBody`, `ConvexBody`, and `VoxelRigidBody`. */
export const RIGID_BODY_COMPONENTS = [
    "bodyType",
    "colliderShape",
    "halfExtents",
    "material",
    "position",
    "rotation",
    "linearVelocity",
    "angularVelocity",
] as const;
