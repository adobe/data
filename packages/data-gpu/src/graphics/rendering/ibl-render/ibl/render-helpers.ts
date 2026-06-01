// © 2026 Adobe. MIT License. See /LICENSE for details.

export { createCubemap } from "./create-cubemap.js";
export { cubeFaceView } from "./cube-face-view.js";
export { cubemapSampleView } from "./cubemap-sample-view.js";

// Fullscreen-triangle vertex shader: three vertices generate a clip-space
// triangle that covers the viewport. The fragment shader then uses
// @builtin(position) (framebuffer pixels) to derive per-fragment UVs.
export const FULLSCREEN_VS = /* wgsl */ `
@vertex
fn vs_fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let xs = array<f32, 3>(-1.0, 3.0, -1.0);
    let ys = array<f32, 3>(-1.0, -1.0, 3.0);
    return vec4f(xs[i], ys[i], 0.0, 1.0);
}
`;
