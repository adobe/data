// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Aabb } from "@adobe/data/math";
import type { JointTemplate } from "../gltf/parse-skin.js";

/** Baked static mesh asset — local-space bounds only. */
export interface StaticMesh {
    localBounds: Aabb;
}

/** Baked skinned mesh asset — static capabilities plus skeleton/animation data. */
export interface SkinnedMesh extends StaticMesh {
    skinJointTemplate: JointTemplate[];
    skinInverseBindMatrices: Float32Array | null;
    animationClipRefs: number[];
}

export * as Mesh from "./public.js";
