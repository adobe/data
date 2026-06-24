// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { InterpolationMode } from "../interpolation-mode/interpolation-mode.js";

export interface AnimationTrack {
    /** Index into the AnimationPlayer's animationTargets array. */
    readonly targetIndex: number;
    /** Component name to write on the resolved target entity. */
    readonly component: string;
    /** Sorted keyframe timestamps. */
    readonly times: Float32Array;
    /** Packed keyframe values (componentsPerKey * times.length entries). */
    readonly values: Float32Array;
    readonly interpolation: InterpolationMode;
}

export * as AnimationTrack from "./public.js";
