// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Debug render for the physics-drop sample. Pipelines share the scene uniform
 * bind group (group 0). Bodies (group 1) are vertex-pulled from the physics
 * GPU buffers — `pose` (2 vec4f/body: pos+boundingRadius, quat) and `props`
 * (4 vec4f/body: vel+invMass, angVel, invInertia, halfExtent+shapeEnum):
 *   - `vs_sphere`/`fs_lit`: instanced unit sphere, scaled by radius; boxes
 *     collapse to a degenerate point.
 *   - `vs_box`/`fs_lit`: instanced unit cube, oriented by the quaternion and
 *     scaled by half-extents; spheres collapse.
 *   - `vs_ground`/`fs_ground`: a flat checkered quad at the floor.
 *   - `vs_particle`/`fs_particle`: instanced sparks from the particle buffer.
 */
export const physicsDropShader = /* wgsl */ `
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
    let speed = length(props[ii * 4u].xyz);
    return mix(vec3f(0.25, 0.55, 0.95), vec3f(0.98, 0.45, 0.2), clamp(speed / 10.0, 0.0, 1.0));
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

// Query-only particles: 3 vec4f per particle (pos+life, prev+size, vel+bounces).
@group(1) @binding(0) var<storage, read> particles: array<vec4f>;

@vertex
fn vs_particle(@builtin(instance_index) ii: u32, @location(0) meshPos: vec3f) -> VOut {
    let a = particles[ii * 3u + 0u];
    let b = particles[ii * 3u + 1u];
    let alive = a.w > 0.0 && b.w > 0.0;
    let size = select(0.0, b.w, alive);
    var out: VOut;
    out.clip = scene.viewProjectionMatrix * vec4f(a.xyz + meshPos * size, 1.0);
    out.normal = normalize(meshPos);
    out.color = vec3f(1.0, 0.75, 0.2);  // bright spark
    return out;
}

@fragment
fn fs_particle(in: VOut) -> @location(0) vec4f {
    let n = normalize(in.normal);
    let L = normalize(-scene.lightDirection);
    let diff = max(dot(n, L), 0.0);
    return vec4f(in.color * (0.6 + diff * 0.6), 1.0);
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
