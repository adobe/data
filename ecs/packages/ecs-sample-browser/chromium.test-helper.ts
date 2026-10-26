// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Chromium's flags: WebGPU where the machine has a GPU, and none on CI's runners, whose WebGPU is software and too slow,
 * unless `ECS_GPU=1`; without it pages see no adapter, as in a browser without WebGPU.
 */
export const chromiumArgs = process.env["ECS_GPU"] === "1" || process.env["CI"] === undefined ? ["--enable-unsafe-webgpu"] : ["--disable-gpu"];
