// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { WebgpuSupport } from "./elements/guide-note.js";

/** Whether the system prefers a dark color scheme. */
export const dark = Symbol();
/** Whether this browser has WebGPU, once the page has asked. */
export const webgpu = Symbol();
/** Whether the page is narrow enough to stack its columns, the prose above the example. */
export const stacked = Symbol();
/** How wide the reader made the prose beside the example, in pixels; 0 for as the page lays it out. */
export const proseWidth = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [dark]: { type: boolean };
        [webgpu]: { type: WebgpuSupport; default: "checking" };
        [stacked]: { type: boolean };
        [proseWidth]: { type: number };
    }
}

/** The chapter on GPU kernels, which says whether this browser has WebGPU. */
export const gpuChapter = 16;

/** Below this width the page stacks its columns. */
export const stackedBelow = 1100;

/** Where the prose's width is kept for the reader, between visits. */
export const proseWidthKey = "ecs-guide/prose-width";
