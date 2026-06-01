// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat, Vec3 } from "@adobe/data/math";
import { readAccessor } from "./accessor-view.js";
import type { GltfAsset } from "./gltf-schema.js";

export interface JointTemplate {
    /** Local-space TRS in glTF node space (relative to joint parent). */
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    /** Index into the same joint-template array of this joint's parent joint,
     *  or -1 when the joint is the rig root (parented to the Model entity). */
    parentJointIndex: number;
    /** Human-readable name from the glTF (debug aid). */
    name?: string;
}

export interface LoadedSkin {
    jointTemplate: JointTemplate[];
    /** Flat N × 16 floats — bind-pose inverse matrices in joint order. */
    inverseBindMatrices: Float32Array;
}

/**
 * Builds a node-index → joint-index map and walks the glTF node hierarchy to
 * find each joint's parent joint (or -1 if its parent is not itself a joint).
 */
function buildJointParentMap(gltf: GltfAsset, jointNodeIndices: readonly number[]): number[] {
    const nodeToJoint = new Map<number, number>();
    for (let j = 0; j < jointNodeIndices.length; j++) nodeToJoint.set(jointNodeIndices[j], j);

    const nodeParent = new Map<number, number>(); // child node → parent node
    for (let n = 0; n < (gltf.nodes ?? []).length; n++) {
        for (const child of gltf.nodes![n].children ?? []) nodeParent.set(child, n);
    }

    return jointNodeIndices.map(nodeIdx => {
        const parentNode = nodeParent.get(nodeIdx);
        if (parentNode === undefined) return -1;
        return nodeToJoint.get(parentNode) ?? -1;
    });
}

export function parseGltfSkin(gltf: GltfAsset, bin: ArrayBuffer): LoadedSkin | null {
    const skin = gltf.skins?.[0];
    if (!skin) return null;

    const parentIndices = buildJointParentMap(gltf, skin.joints);

    const jointTemplate: JointTemplate[] = skin.joints.map((nodeIdx, jointIdx) => {
        const node = gltf.nodes![nodeIdx];
        return {
            position: (node.translation ?? [0, 0, 0]) as Vec3,
            rotation: (node.rotation ?? [0, 0, 0, 1]) as Quat,
            scale: (node.scale ?? [1, 1, 1]) as Vec3,
            parentJointIndex: parentIndices[jointIdx],
            name: node.name,
        };
    });

    const inverseBindMatrices = skin.inverseBindMatrices !== undefined
        ? new Float32Array(readAccessor(gltf, bin, skin.inverseBindMatrices) as Float32Array)
        : new Float32Array(skin.joints.length * 16).fill(0).map((_, i) => i % 17 === 0 ? 1 : 0);

    return { jointTemplate, inverseBindMatrices };
}
