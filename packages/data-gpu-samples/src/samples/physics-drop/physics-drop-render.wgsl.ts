// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Debug render for the physics-drop sample. Two pipelines sharing the scene
 * uniform bind group (group 0):
 *   - `vs_sphere`/`fs_lit`: instanced unit-sphere mesh, vertex-pulling each
 *     instance's center + radius from the physics body storage buffer (group 1).
 *   - `vs_ground`/`fs_ground`: a flat checkered quad at the floor for depth cue.
 */
export const physicsDropShader = /* wgsl */ `
struct SceneUniforms {
    viewProjectionMatrix: mat4x4<f32>,
    lightDirection: vec3f,
    ambientStrength: f32,
    lightColor: vec3f,
    cameraPosition: vec3f,
}

struct Body {
    pos: vec4f,   // xyz center, w = radius
    vel: vec4f,   // xyz velocity, w = inverse mass
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> bodies: array<Body>;

struct VOut {
    @builtin(position) clip:   vec4f,
    @location(0)       normal: vec3f,
    @location(1)       color:  vec3f,
}

@vertex
fn vs_sphere(@builtin(instance_index) ii: u32, @location(0) meshPos: vec3f) -> VOut {
    let b = bodies[ii];
    let world = b.pos.xyz + meshPos * b.pos.w;
    var out: VOut;
    out.clip = scene.viewProjectionMatrix * vec4f(world, 1.0);
    out.normal = normalize(meshPos);
    let speed = length(b.vel.xyz);
    out.color = mix(vec3f(0.25, 0.55, 0.95), vec3f(0.98, 0.45, 0.2), clamp(speed / 10.0, 0.0, 1.0));
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
