// © 2026 Adobe. MIT License. See /LICENSE for details.

import brdf from "./brdf.wgsl.js";

// Skybox shader. Computes the view-ray direction in the vertex shader from the
// camera's orthonormal basis + half-FOV — bypasses the perspective matrix
// inverse, which would otherwise depend on the project's specific
// clip-space convention. Depth state is "always" with no write so primitives
// drawn afterward in the same render pass overlap correctly.
export default /* wgsl */ `
struct SkyboxUniforms {
    right: vec3f,
    aspect: f32,
    up: vec3f,
    tanHalfFov: f32,
    forward: vec3f,
    _pad: f32,
}
@group(0) @binding(0) var<uniform> sky: SkyboxUniforms;
@group(0) @binding(1) var skyCubemap: texture_cube<f32>;
@group(0) @binding(2) var skySampler: sampler;

struct SkyboxOutput {
    @builtin(position) clip: vec4f,
    @location(0) dir: vec3f,
}

@vertex
fn vs_skybox(@builtin(vertex_index) i: u32) -> SkyboxOutput {
    let xs = array<f32, 3>(-1.0, 3.0, -1.0);
    let ys = array<f32, 3>(-1.0, -1.0, 3.0);
    let xn = xs[i];
    let yn = ys[i];
    var out: SkyboxOutput;
    out.clip = vec4f(xn, yn, 0.0, 1.0);
    out.dir = sky.forward
        + sky.right * (xn * sky.aspect * sky.tanHalfFov)
        + sky.up * (yn * sky.tanHalfFov);
    return out;
}

${brdf}

@fragment
fn fs_skybox(in: SkyboxOutput) -> @location(0) vec4f {
    let dir = normalize(in.dir);
    let raw = textureSampleLevel(skyCubemap, skySampler, dir, 0.0).rgb;
    let mapped = tone_map_aces(raw);
    return vec4f(pow(mapped, vec3f(1.0 / 2.2)), 1.0);
}
`;
