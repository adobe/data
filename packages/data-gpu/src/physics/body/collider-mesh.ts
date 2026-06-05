// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Authored triangle mesh for a **static** `mesh` collider (terrain, level
 * geometry): flat vertex positions (xyz triples) + triangle indices. Static only
 * — a triangle soup has no interior, so it can't be a moving body. Held as a
 * runtime object component (`colliderMesh`); the solver reads it once to build
 * the engine trimesh, the bridge once to build the render mesh.
 */
export interface ColliderMesh {
    positions: Float32Array; // xyz triples
    indices: Uint32Array;    // triangle list (3 indices per face)
}
