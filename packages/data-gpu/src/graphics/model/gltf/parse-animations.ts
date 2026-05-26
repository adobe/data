// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { AnimationTrack } from "../../animation/animation-track/animation-track.js";
import type { InterpolationMode } from "../../animation/interpolation-mode/interpolation-mode.js";
import { readAccessor } from "./accessor-view.js";
import type { GltfAsset } from "./gltf-schema.js";

export interface LoadedAnimation {
    name?: string;
    duration: number;
    tracks: AnimationTrack[];
}

const PATH_TO_COMPONENT: Record<string, string> = {
    translation: "position",
    rotation: "rotation",
    scale: "scale",
};

const INTERP_MAP: Record<string, InterpolationMode> = {
    LINEAR: "linear",
    STEP: "step",
    CUBICSPLINE: "cubicSpline",
};

/**
 * Parses glTF `animations[]` into clip data sized for our AnimationClip
 * archetype. Each `track.targetIndex` is the **joint index** (position in
 * `skin.joints`) — the skinning init system places joint entity IDs at those
 * indices in the AnimationPlayer's `animationTargets` so the clip is portable
 * across instances.
 *
 * Tracks targeting non-joint nodes or unsupported paths (e.g. morph weights)
 * are skipped.
 */
export function parseGltfAnimations(
    gltf: GltfAsset,
    bin: ArrayBuffer,
    jointNodeIndices: readonly number[],
): LoadedAnimation[] {
    if (!gltf.animations || gltf.animations.length === 0) return [];

    const nodeToJoint = new Map<number, number>();
    for (let j = 0; j < jointNodeIndices.length; j++) nodeToJoint.set(jointNodeIndices[j], j);

    return gltf.animations.map(anim => {
        const tracks: AnimationTrack[] = [];
        let duration = 0;
        for (const channel of anim.channels) {
            const component = PATH_TO_COMPONENT[channel.target.path];
            if (!component) continue; // skip morph "weights" etc.
            const jointIdx = nodeToJoint.get(channel.target.node);
            if (jointIdx === undefined) continue;

            const sampler = anim.samplers[channel.sampler];
            const times = new Float32Array(readAccessor(gltf, bin, sampler.input) as Float32Array);
            const values = new Float32Array(readAccessor(gltf, bin, sampler.output) as Float32Array);
            const interpolation = INTERP_MAP[sampler.interpolation ?? "LINEAR"] ?? "linear";

            tracks.push({ targetIndex: jointIdx, component, times, values, interpolation });
            const lastTime = times[times.length - 1] ?? 0;
            if (lastTime > duration) duration = lastTime;
        }
        return { name: anim.name, duration, tracks };
    });
}
