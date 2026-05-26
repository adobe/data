// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Mat4x4, Quat } from "@adobe/data/math";
import type { GltfAsset, GltfNode } from "./gltf-schema.js";

function localMatrix(node: GltfNode): Mat4x4 {
    if (node.matrix && node.matrix.length === 16) {
        return node.matrix as unknown as Mat4x4;
    }
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1];
    const s = node.scale ?? [1, 1, 1];
    const T = Mat4x4.translation(t[0], t[1], t[2]);
    const R = Quat.toMat4(r as unknown as Quat);
    const S = Mat4x4.scaling(s[0], s[1], s[2]);
    return Mat4x4.multiply(Mat4x4.multiply(T, R), S);
}

/**
 * Walks the scene graph and returns a world matrix for every node index.
 * Nodes not reachable from a scene root get the identity matrix.
 */
export function computeWorldMatrices(gltf: GltfAsset): Mat4x4[] {
    const result: Mat4x4[] = new Array((gltf.nodes ?? []).length).fill(Mat4x4.identity);

    const visit = (nodeIdx: number, parent: Mat4x4): void => {
        const node = gltf.nodes![nodeIdx];
        const world = Mat4x4.multiply(parent, localMatrix(node));
        result[nodeIdx] = world;
        for (const child of node.children ?? []) {
            visit(child, world);
        }
    };

    const sceneIdx = gltf.scene ?? 0;
    const roots = gltf.scenes?.[sceneIdx]?.nodes ?? [];
    for (const r of roots) {
        visit(r, Mat4x4.identity);
    }
    return result;
}
