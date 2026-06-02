// © 2026 Adobe. MIT License. See /LICENSE for details.

import { wgslStructFields } from "@adobe/data/typed-buffer";
import { schema as sceneUniformsSchema } from "../../scene/scene-uniforms/schema.js";
import brdf from "../ibl-render/brdf.wgsl.js";

/**
 * Unified PBR shader for instanced primitives (and, after convergence, glTF).
 * Materials come from the shared `materialGpu` set — five `texture_2d_array`s +
 * a palette of per-layer factors (group 1) — selected by a per-instance layer
 * index (group 3, binding 1). Shading is identical Cook-Torrance + split-sum
 * IBL to the per-material `ibl-shader`; only the material *source* differs.
 */
export function buildPbrArrayShader(options: { prefilteredMipCount: number }): string {
    return /* wgsl */ `
struct SceneUniforms {
${wgslStructFields(sceneUniformsSchema)}
}

struct MaterialFactors {
    baseColorFactor: vec4f,
    emissiveMetallic: vec4f,   // emissive.rgb, metallicFactor
    roughNormalOcc: vec4f,     // roughnessFactor, normalScale, occlusionStrength, _
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

@group(1) @binding(0) var<storage, read> palette: array<MaterialFactors>;
@group(1) @binding(1) var baseColorArray: texture_2d_array<f32>;
@group(1) @binding(2) var metallicRoughnessArray: texture_2d_array<f32>;
@group(1) @binding(3) var normalArray: texture_2d_array<f32>;
@group(1) @binding(4) var occlusionArray: texture_2d_array<f32>;
@group(1) @binding(5) var emissiveArray: texture_2d_array<f32>;
@group(1) @binding(6) var matSampler: sampler;

@group(2) @binding(0) var iblIrradiance: texture_cube<f32>;
@group(2) @binding(1) var iblPrefiltered: texture_cube<f32>;
@group(2) @binding(2) var iblBrdfLut: texture_2d<f32>;
@group(2) @binding(3) var iblSampler: sampler;

@group(3) @binding(0) var<storage, read> instances: array<mat4x4<f32>>;
@group(3) @binding(1) var<storage, read> layers: array<u32>;

const PREFILTERED_MIP_COUNT: f32 = ${options.prefilteredMipCount.toFixed(1)};

struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) tangent: vec4f,
    @location(3) uv: vec2f,
}

struct VertexOutput {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) tangent: vec3f,
    @location(3) bitangent: vec3f,
    @location(4) uv: vec2f,
    @location(5) @interpolate(flat) layer: u32,
}

@vertex
fn vs_main(@builtin(instance_index) instanceIndex: u32, in: VertexInput) -> VertexOutput {
    let m = instances[instanceIndex];
    let m3 = mat3x3<f32>(m[0].xyz, m[1].xyz, m[2].xyz);
    let normalMat = mat3x3<f32>(
        cross(m3[1], m3[2]),
        cross(m3[2], m3[0]),
        cross(m3[0], m3[1]),
    );
    let worldPos = m * vec4f(in.position, 1.0);
    var out: VertexOutput;
    out.clipPosition = scene.viewProjectionMatrix * worldPos;
    out.worldPosition = worldPos.xyz;
    out.normal = normalize(normalMat * in.normal);
    out.tangent = normalize(m3 * in.tangent.xyz);
    out.bitangent = normalize(cross(out.normal, out.tangent) * in.tangent.w);
    out.uv = in.uv;
    out.layer = layers[instanceIndex];
    return out;
}

${brdf}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let f = palette[in.layer];
    let li = i32(in.layer);

    let baseColor = textureSample(baseColorArray, matSampler, in.uv, li) * f.baseColorFactor;

    let mr = textureSample(metallicRoughnessArray, matSampler, in.uv, li);
    let metallic = mr.b * f.emissiveMetallic.w;
    var roughness = mr.g * f.roughNormalOcc.x;
    roughness = max(roughness, MIN_ROUGHNESS);
    let alpha = roughness * roughness;

    let occlusion = textureSample(occlusionArray, matSampler, in.uv, li).r;
    let emissive = textureSample(emissiveArray, matSampler, in.uv, li).rgb * f.emissiveMetallic.xyz;

    let nSampled = textureSample(normalArray, matSampler, in.uv, li).rgb * 2.0 - vec3f(1.0);
    let nScaled = vec3f(nSampled.xy * f.roughNormalOcc.y, nSampled.z);
    let tbn = mat3x3<f32>(in.tangent, in.bitangent, in.normal);
    let N = normalize(tbn * nScaled);

    let V = normalize(scene.cameraPosition - in.worldPosition);
    let nDotV = max(dot(N, V), 0.001);
    let R = reflect(-V, N);

    let f0 = mix(vec3f(0.04), baseColor.rgb, metallic);

    // --- IBL contribution (split-sum) ---
    let F_ibl = f_schlick_roughness(nDotV, f0, roughness);
    let kD_ibl = (vec3f(1.0) - F_ibl) * (1.0 - metallic);

    let irradiance = textureSampleLevel(iblIrradiance, iblSampler, N, 0.0).rgb;
    let diffuseIbl = kD_ibl * irradiance * baseColor.rgb;

    let mipLevel = roughness * (PREFILTERED_MIP_COUNT - 1.0);
    let prefiltered = textureSampleLevel(iblPrefiltered, iblSampler, R, mipLevel).rgb;
    let envBrdf = textureSampleLevel(iblBrdfLut, iblSampler, vec2f(nDotV, roughness), 0.0).rg;
    let specularIbl = prefiltered * (F_ibl * envBrdf.x + envBrdf.y);

    let ambient = (diffuseIbl + specularIbl) * mix(1.0, occlusion, f.roughNormalOcc.z);

    // --- Direct light (parity with the single scene light) ---
    let L = normalize(-scene.lightDirection);
    let H = normalize(V + L);
    let nDotL = max(dot(N, L), 0.0);
    let nDotH = max(dot(N, H), 0.0);
    let vDotH = max(dot(V, H), 0.0);
    let D_d = d_ggx(nDotH, alpha);
    let G_d = g_smith(nDotV, nDotL, alpha);
    let F_d = f_schlick(vDotH, f0);
    let spec_d = (D_d * G_d * F_d) / (4.0 * nDotV * nDotL + 0.0001);
    let kD_d = (vec3f(1.0) - F_d) * (1.0 - metallic);
    let direct = (kD_d * baseColor.rgb / PI + spec_d) * scene.lightColor * nDotL;

    let color = direct + ambient + emissive;
    let mapped = tone_map_aces(color);
    let gamma = pow(mapped, vec3f(1.0 / 2.2));
    return vec4f(gamma, baseColor.a);
}
`;
}
