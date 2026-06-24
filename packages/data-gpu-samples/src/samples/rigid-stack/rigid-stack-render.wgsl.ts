// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Debug render for the rigid-stack sample. Like physics-drop, bodies are
 * instanced and vertex-pulled from two storage buffers, but the CPU solver
 * packs different `props`:
 *   - `pose`  (2 vec4f/body): pos + boundingRadius, orientation quat.
 *   - `props` (4 vec4f/body): vel + _, materialColor + _, _, halfExtent + shape.
 *
 * Bodies are tinted by their material's base albedo (so wood/steel/ice read at
 * a glance) and brightened — hue preserved — by speed, so moving bodies pop.
 */
export const rigidStackShader = /* wgsl */ `
struct SceneUniforms {
    viewProjectionMatrix: mat4x4<f32>,
    lightDirection: vec3f,
    ambientStrength: f32,
    lightColor: vec3f,
    cameraPosition: vec3f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> pose:  array<vec4f>;  // 2 / body
@group(1) @binding(1) var<storage, read> props: array<vec4f>;  // 4 / body

fn qRot(q: vec4f, v: vec3f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

fn bodyColor(ii: u32) -> vec3f {
    let base  = props[ii * 4u + 1u].xyz;        // material albedo
    let speed = length(props[ii * 4u].xyz);
    // brighten while moving (hue retained); resting bodies show true material.
    return base * (1.0 + clamp(speed / 6.0, 0.0, 1.0) * 1.4);
}

struct VOut {
    @builtin(position) clip:   vec4f,
    @location(0)       normal: vec3f,
    @location(1)       color:  vec3f,
}

@vertex
fn vs_sphere(@builtin(instance_index) ii: u32, @location(0) meshPos: vec3f) -> VOut {
    let p = pose[ii * 2u];
    let isSphere = props[ii * 4u + 3u].w < 0.5;
    let r = select(0.0, p.w, isSphere);
    var out: VOut;
    out.clip = scene.viewProjectionMatrix * vec4f(p.xyz + meshPos * r, 1.0);
    out.normal = normalize(meshPos);
    out.color = bodyColor(ii);
    return out;
}

@vertex
fn vs_box(@builtin(instance_index) ii: u32, @location(0) cubePos: vec3f, @location(1) cubeNormal: vec3f) -> VOut {
    let center = pose[ii * 2u].xyz;
    let q = pose[ii * 2u + 1u];
    let he = props[ii * 4u + 3u].xyz;
    let isBox = props[ii * 4u + 3u].w > 0.5;
    let scale = select(vec3f(0.0), he, isBox);
    var out: VOut;
    out.clip = scene.viewProjectionMatrix * vec4f(center + qRot(q, cubePos * scale), 1.0);
    out.normal = qRot(q, cubeNormal);
    out.color = bodyColor(ii);
    return out;
}

@fragment
fn fs_lit(in: VOut) -> @location(0) vec4f {
    let n = normalize(in.normal);
    let L = normalize(-scene.lightDirection);
    let diff = max(dot(n, L), 0.0);
    let lit = in.color * (scene.ambientStrength + diff * scene.lightColor);
    return vec4f(lit, 1.0);
}

struct GOut {
    @builtin(position) clip:  vec4f,
    @location(0)       world: vec3f,
}

@vertex
fn vs_ground(@location(0) pos: vec3f) -> GOut {
    var out: GOut;
    out.clip = scene.viewProjectionMatrix * vec4f(pos, 1.0);
    out.world = pos;
    return out;
}

@fragment
fn fs_ground(in: GOut) -> @location(0) vec4f {
    let c = floor(in.world.x) + floor(in.world.z);
    let odd = (c - 2.0 * floor(c * 0.5)) < 0.5;
    let shade = select(0.10, 0.16, odd);
    return vec4f(vec3f(shade), 1.0);
}
`;
