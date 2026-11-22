// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The scene's WGSL, each program's vertex and fragment stages, all in linear light, after `common`, which every program
 * takes after the view's declarations: the scene's bind group, a unit cube's vertices, a direction through a matrix, the procedural sky, the sun, the
 * sky's light on a surface, the split-sum environment BRDF, and `display`, which exposes and tone maps to sRGB.
 */
export const shaders = {
    common: /* wgsl */ `
// The sky's inverse projection and the eye; and the model being edited, its matrix to the world and size in voxels.
struct Scene { inverseViewProjection: mat4x4f, eye: vec4f, edit: mat4x4f, editSize: vec4f }
@group(2) @binding(0) var<uniform> scene: Scene;
@group(2) @binding(1) var<storage, read> materials: array<vec4f>;

struct CubeVertex { corner: vec3f, normal: vec3f }

// A unit cube's 36 vertices, from 0 to 1, each side two triangles wound counterclockwise seen from outside.
fn cubeVertex(index: u32) -> CubeVertex {
    let side = index / 6u;
    let axis = side / 2u;
    let positive = (side % 2u) == 0u;
    var wound = array(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));
    var flipped = array(vec2f(0, 0), vec2f(1, 1), vec2f(1, 0), vec2f(0, 0), vec2f(0, 1), vec2f(1, 1));
    let across = select(flipped[index % 6u], wound[index % 6u], positive);
    var corner = vec3f(0.0);
    var normal = vec3f(0.0);
    corner[axis] = select(0.0, 1.0, positive);
    corner[(axis + 1u) % 3u] = across.x;
    corner[(axis + 2u) % 3u] = across.y;
    normal[axis] = select(-1.0, 1.0, positive);
    return CubeVertex(corner, normal);
}

// A direction through a matrix, of unit length.
fn turned(matrix: mat4x4f, direction: vec3f) -> vec3f { return normalize((matrix * vec4f(direction, 0.0)).xyz); }

// Where a side's two in-plane coordinates come from, by its normal.
fn acrossOf(point: vec3f, normal: vec3f) -> vec2f {
    let a = abs(normal);
    return select(select(point.xy, point.zx, a.y > 0.5), point.yz, a.x > 0.5);
}

const sunDirection = vec3f(0.4436, 0.7886, 0.3450);
const sunRadiance = vec3f(2.6, 2.45, 2.2);
const zenith = vec3f(0.05, 0.15, 0.48);
const horizon = vec3f(0.40, 0.52, 0.72);
const ground = vec3f(0.09, 0.08, 0.07);
const exposure = 0.8;
const PI = 3.14159265;

fn gradient(direction: vec3f) -> vec3f {
    let y = direction.y;
    return select(mix(horizon, ground, pow(max(-y, 0.0), 0.25)), mix(horizon, zenith, pow(max(y, 0.0), 0.6)), y >= 0.0);
}

fn sky(direction: vec3f) -> vec3f {
    let toward = max(dot(direction, sunDirection), 0.0);
    return gradient(direction) + sunRadiance * (pow(toward, 1500.0) * 40.0 + pow(toward, 12.0) * 0.25);
}

// The sky as a surface of this roughness reflects it: the sun's lobe widened and dimmed, keeping about its light.
fn skyBlurred(direction: vec3f, roughness: f32) -> vec3f {
    let spread = mix(1500.0, 3.0, sqrt(roughness));
    let toward = max(dot(direction, sunDirection), 0.0);
    let sun = pow(toward, spread) * (spread + 2.0) / (2.0 * PI) * 0.08;
    let soft = mix(gradient(direction), mix(ground, zenith, direction.y * 0.5 + 0.5) * 0.8 + horizon * 0.2, roughness);
    return soft + sunRadiance * sun;
}

fn irradiance(normal: vec3f) -> vec3f {
    return mix(ground * 1.2, mix(horizon, zenith, 0.5), normal.y * 0.5 + 0.5);
}

fn environmentBRDF(NoV: f32, roughness: f32) -> vec2f {
    let r = roughness * vec4f(-1.0, -0.0275, -0.572, 0.022) + vec4f(1.0, 0.0425, 1.04, -0.04);
    let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
    return vec2f(-1.04, 1.04) * a004 + r.zw;
}

fn display(light: vec3f) -> vec4f {
    let linear = light * exposure;
    let mapped = clamp((linear * (2.51 * linear + 0.03)) / (linear * (2.43 * linear + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
    return vec4f(pow(mapped, vec3f(1.0 / 2.2)), 1.0);
}
`,

    /** The sky, behind everything: a triangle covering the view at the far plane, each pixel the sky its way. */
    sky: /* wgsl */ `
struct Sky { @builtin(position) position: vec4f, @location(0) toward: vec3f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Sky {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u)) * 2.0 - 1.0;
    let far = scene.inverseViewProjection * vec4f(corner, 1.0, 1.0);
    return Sky(vec4f(corner, 1.0, 1.0), far.xyz / far.w - scene.eye.xyz);
}

@fragment fn fragmentMain(in: Sky) -> @location(0) vec4f { return display(sky(normalize(in.toward))); }
`,

    /** The far walls: the inside of a box around the model edited, a checkerboard of its cells, lit by the sun and the sky. */
    wall: /* wgsl */ `
struct Wall { @builtin(position) position: vec4f, @location(0) cell: vec3f, @location(1) facing: vec3f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Wall {
    let cube = cubeVertex(index);
    let cell = cube.corner * scene.editSize.xyz;
    // Seen from inside the box, the walls face in.
    return Wall(view.projection * scene.edit * vec4f(cell, 1.0), cell, -cube.normal);
}

@fragment fn fragmentMain(in: Wall) -> @location(0) vec4f {
    let across = acrossOf(in.cell, in.facing);
    let facing = turned(scene.edit, in.facing);
    let square = floor(across);
    let checker = (square.x + square.y) - 2.0 * floor((square.x + square.y) / 2.0);
    let inside = fract(across);
    let line = min(min(inside.x, 1.0 - inside.x), min(inside.y, 1.0 - inside.y));
    let albedo = vec3f(mix(0.07, 0.12, checker) * mix(0.75, 1.0, smoothstep(0.0, 0.03, line)));
    return display(albedo * (irradiance(facing) + sunRadiance * max(dot(facing, sunDirection), 0.0) / PI));
}
`,

    /** The edited model's axes from its origin, `x` red, `y` green and `z` blue, each a thin bar as long as the model. */
    axis: /* wgsl */ `
struct Bar { @builtin(position) position: vec4f, @location(0) color: vec3f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32, @builtin(instance_index) axis: u32) -> Bar {
    let cube = cubeVertex(index);
    let thick = 0.06;
    var extent = vec3f(thick);
    extent[axis] = scene.editSize[axis] + thick * 0.5;
    var colors = array(vec3f(0.95, 0.25, 0.25), vec3f(0.35, 0.85, 0.3), vec3f(0.3, 0.5, 1.0));
    let lit = 0.75 + 0.25 * abs(dot(turned(scene.edit, cube.normal), sunDirection));
    return Bar(view.projection * scene.edit * vec4f(vec3f(-thick * 0.5) + cube.corner * extent, 1.0), colors[axis] * lit);
}

@fragment fn fragmentMain(in: Bar) -> @location(0) vec4f { return vec4f(in.color, 1.0); }
`,

    /**
     * The voxels, physically based: metallic-roughness, the sun as a direct light through a GGX microfacet BRDF, and the
     * sky as image-based light, diffuse from its irradiance and specular from it blurred by roughness through the
     * split-sum environment BRDF; edges a little darker, as ambient occlusion would make them.
     */
    voxel: /* wgsl */ `
// The matrix taking this draw's model's voxels to the world.
@group(3) @binding(0) var<uniform> placement: mat4x4f;

struct Surface {
    @builtin(position) position: vec4f,
    @location(0) local: vec3f,
    @location(1) world: vec3f,
    @location(2) facing: vec3f,
    @location(3) @interpolate(flat) slot: u32,
    @location(4) side: vec3f,
}

@vertex fn vertexMain(@builtin(vertex_index) index: u32, @builtin(instance_index) row: u32) -> Surface {
    let cube = cubeVertex(index);
    let world = (placement * vec4f(voxelPosition(row) + cube.corner, 1.0)).xyz;
    // A face shows its voxel's paint where its side's bit is set: +x, -x, +y, -y, +z, -z.
    let n = cube.normal;
    let side = select(select(4u, 2u, n.y != 0.0), 0u, n.x != 0.0) + select(0u, 1u, n.x + n.y + n.z < 0.0);
    let painted = voxelPaint(row);
    let slot = select(voxelSlot(row), painted >> 6u, (painted & (1u << side)) != 0u);
    return Surface(view.projection * vec4f(world, 1.0), cube.corner, world, turned(placement, cube.normal), slot, cube.normal);
}

@fragment fn fragmentMain(in: Surface) -> @location(0) vec4f {
    let first = materials[in.slot * 2u];
    let albedo = first.rgb;
    let metallic = clamp(first.a, 0.0, 1.0);
    let roughness = clamp(materials[in.slot * 2u + 1u].x, 0.04, 1.0);
    let N = normalize(in.facing);
    let V = normalize(scene.eye.xyz - in.world);
    let alpha = roughness * roughness;
    let F0 = mix(vec3f(0.04), albedo, metallic);
    let NoV = max(dot(N, V), 1e-4);

    let L = sunDirection;
    let H = normalize(V + L);
    let NoL = max(dot(N, L), 0.0);
    let NoH = max(dot(N, H), 0.0);
    let VoH = max(dot(V, H), 0.0);
    let a2 = alpha * alpha;
    let d = NoH * NoH * (a2 - 1.0) + 1.0;
    let D = a2 / (PI * d * d);
    let k = alpha * 0.5;
    let G = (NoV / (NoV * (1.0 - k) + k)) * (NoL / (NoL * (1.0 - k) + k));
    let F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
    let specular = D * G * F / max(4.0 * NoV * NoL, 1e-4);
    let diffuse = (1.0 - F) * (1.0 - metallic) * albedo / PI;
    let direct = (diffuse + specular) * sunRadiance * NoL;

    let R = reflect(-V, N);
    let brdf = environmentBRDF(NoV, roughness);
    let Fr = F0 + (max(vec3f(1.0 - roughness), F0) - F0) * pow(1.0 - NoV, 5.0);
    let ambientSpecular = skyBlurred(R, roughness) * (F0 * brdf.x + brdf.y);
    let ambientDiffuse = (1.0 - Fr) * (1.0 - metallic) * albedo * irradiance(N);

    let across = acrossOf(in.local, in.side);
    let edge = min(min(across.x, 1.0 - across.x), min(across.y, 1.0 - across.y));
    let occlusion = mix(0.7, 1.0, smoothstep(0.0, 0.08, edge));
    return display(direct + (ambientDiffuse + ambientSpecular) * occlusion);
}
`,

    /** The selected faces: translucent quads with a rim, lifted a fiftieth of a voxel off the side they're on. */
    face: /* wgsl */ `
struct Quad { @builtin(position) position: vec4f, @location(0) across: vec2f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32, @builtin(instance_index) row: u32) -> Quad {
    var corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(1, 1), vec2f(0, 0), vec2f(1, 1), vec2f(0, 1));
    let corner = corners[index];
    let side = faceSideOf(row);
    let axis = side / 2u;
    let direction = select(-1.0, 1.0, (side % 2u) == 0u);
    var point = vec3f(faceCellOf(row));
    var normal = vec3f(0.0);
    point[axis] += select(0.0, 1.0, direction > 0.0);
    normal[axis] = direction;
    point[(axis + 1u) % 3u] += corner.x;
    point[(axis + 2u) % 3u] += corner.y;
    return Quad(view.projection * scene.edit * vec4f(point + normal * 0.02, 1.0), corner);
}

@fragment fn fragmentMain(in: Quad) -> @location(0) vec4f {
    let edge = min(min(in.across.x, 1.0 - in.across.x), min(in.across.y, 1.0 - in.across.y));
    let rim = 1.0 - smoothstep(0.04, 0.09, edge);
    return vec4f(mix(vec3f(1.0, 0.62, 0.15), vec3f(1.0, 0.85, 0.4), rim), mix(0.45, 0.95, rim));
}
`,
};
