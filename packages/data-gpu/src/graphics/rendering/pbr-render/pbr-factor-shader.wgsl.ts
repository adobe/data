// © 2026 Adobe. MIT License. See /LICENSE for details.

import { wgslStructFields } from "@adobe/data/typed-buffer";
import { schema as sceneUniformsSchema } from "../../scene/scene-uniforms/schema.js";
import brdf from "../ibl-render/brdf.wgsl.js";

/**
 * Factor-only PBR for instanced primitives — palette factors + vertex normals,
 * no material map sampling. Used by `pbrFactorRender`.
 */
export function buildPbrFactorShader(options: { prefilteredMipCount: number }): string {
    return /* wgsl */ `
struct SceneUniforms {
${wgslStructFields(sceneUniformsSchema)}
}

struct MaterialFactors {
    baseColorFactor: vec4f,
    emissiveMetallic: vec4f,   // emissive.rgb, metallicFactor
    roughNormalIr: vec4f,      // roughnessFactor, normalScale, occlusionStrength, irEmission
    emissionMeta: vec4f,       // emissionMode, _, _, _
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

@group(1) @binding(0) var<storage, read> palette: array<MaterialFactors>;

@group(2) @binding(0) var iblIrradiance: texture_cube<f32>;
@group(2) @binding(1) var iblPrefiltered: texture_cube<f32>;
@group(2) @binding(2) var iblBrdfLut: texture_2d<f32>;
@group(2) @binding(3) var iblSampler: sampler;

@group(3) @binding(0) var<storage, read> instances: array<mat4x4<f32>>;
@group(3) @binding(1) var<storage, read> paletteIndices: array<u32>;

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
    @location(5) @interpolate(flat) paletteIndex: u32,
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
    out.paletteIndex = paletteIndices[instanceIndex];
    return out;
}

${brdf}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let f = palette[in.paletteIndex];

    let baseColor = f.baseColorFactor;
    let metallic = f.emissiveMetallic.w;
    var roughness = f.roughNormalIr.x;
    roughness = max(roughness, MIN_ROUGHNESS);
    let alpha = roughness * roughness;
    let occlusion = f.roughNormalIr.z;
    let emissionMode = f.emissionMeta.x;
    let irEmission = f.roughNormalIr.w;
    // 0 = UV fluorescence (no visible add); 1 = visible luminescence (emissive + IR glow).
    let emissive = select(vec3f(0.0), f.emissiveMetallic.xyz + vec3f(irEmission), emissionMode >= 0.5);

    let N = normalize(in.normal);
    let V = normalize(scene.cameraPosition - in.worldPosition);
    let nDotV = max(dot(N, V), 0.001);
    let R = reflect(-V, N);

    let f0 = mix(vec3f(0.04), baseColor.rgb, metallic);

    let F_ibl = f_schlick_roughness(nDotV, f0, roughness);
    let kD_ibl = (vec3f(1.0) - F_ibl) * (1.0 - metallic);

    let irradiance = textureSampleLevel(iblIrradiance, iblSampler, N, 0.0).rgb;
    let diffuseIbl = kD_ibl * irradiance * baseColor.rgb;

    let mipLevel = roughness * (PREFILTERED_MIP_COUNT - 1.0);
    let prefiltered = textureSampleLevel(iblPrefiltered, iblSampler, R, mipLevel).rgb;
    let envBrdf = textureSampleLevel(iblBrdfLut, iblSampler, vec2f(nDotV, roughness), 0.0).rg;
    let specularIbl = prefiltered * (F_ibl * envBrdf.x + envBrdf.y);

    let ambient = (diffuseIbl + specularIbl) * occlusion;

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
