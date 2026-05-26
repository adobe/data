// © 2026 Adobe. MIT License. See /LICENSE for details.

import { wgslStructFields } from "@adobe/data/typed-buffer";
import { schema as sceneUniformsSchema } from "../../scene-uniforms/schema.js";
import { schema as visibleMaterialSchema } from "../visible-material/schema.js";
import brdf from "./brdf.wgsl.js";

export interface IblShaderOptions {
    prefilteredMipCount: number;
    /** When true, the vertex shader accepts JOINTS_0 / WEIGHTS_0 attributes and
     *  a joint-matrix storage buffer in bind group 4, and blends each vertex by
     *  the four weighted joint matrices before applying the instance transform. */
    skinned: boolean;
}

export function buildIblShader(options: IblShaderOptions): string {
    // Skinned variant adds jointMatrices as binding 1 of group 3 (sharing the
    // slot with instance matrices) so we stay within WebGPU's default
    // maxBindGroups = 4 limit.
    const skinningBindings = options.skinned ? /* wgsl */ `
@group(3) @binding(1) var<storage, read> jointMatrices: array<mat4x4<f32>>;
` : "";

    const vertexInputs = options.skinned ? /* wgsl */ `
struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) tangent: vec4f,
    @location(3) uv: vec2f,
    @location(4) joints: vec4u,
    @location(5) weights: vec4f,
}` : /* wgsl */ `
struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) tangent: vec4f,
    @location(3) uv: vec2f,
}`;

    const vertexMain = options.skinned ? /* wgsl */ `
@vertex
fn vs_main(@builtin(instance_index) instanceIndex: u32, in: VertexInput) -> VertexOutput {
    let skinMat =
        jointMatrices[in.joints.x] * in.weights.x +
        jointMatrices[in.joints.y] * in.weights.y +
        jointMatrices[in.joints.z] * in.weights.z +
        jointMatrices[in.joints.w] * in.weights.w;
    let m = instances[instanceIndex] * skinMat;
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
    return out;
}` : /* wgsl */ `
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
    return out;
}`;

    return /* wgsl */ `
struct SceneUniforms {
${wgslStructFields(sceneUniformsSchema)}
}

struct VisibleMaterial {
${wgslStructFields(visibleMaterialSchema)}
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

@group(1) @binding(0) var<uniform> material: VisibleMaterial;
@group(1) @binding(1) var baseColorTexture: texture_2d<f32>;
@group(1) @binding(2) var metallicRoughnessTexture: texture_2d<f32>;
@group(1) @binding(3) var normalTexture: texture_2d<f32>;
@group(1) @binding(4) var occlusionTexture: texture_2d<f32>;
@group(1) @binding(5) var emissiveTexture: texture_2d<f32>;
@group(1) @binding(6) var pbrSampler: sampler;

@group(2) @binding(0) var iblIrradiance: texture_cube<f32>;
@group(2) @binding(1) var iblPrefiltered: texture_cube<f32>;
@group(2) @binding(2) var iblBrdfLut: texture_2d<f32>;
@group(2) @binding(3) var iblSampler: sampler;

@group(3) @binding(0) var<storage, read> instances: array<mat4x4<f32>>;
${skinningBindings}
const PREFILTERED_MIP_COUNT: f32 = ${options.prefilteredMipCount.toFixed(1)};

${vertexInputs}

struct VertexOutput {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) tangent: vec3f,
    @location(3) bitangent: vec3f,
    @location(4) uv: vec2f,
}

${vertexMain}

${brdf}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let baseColor = textureSample(baseColorTexture, pbrSampler, in.uv) * material.baseColorFactor;

    let mr = textureSample(metallicRoughnessTexture, pbrSampler, in.uv);
    let metallic = mr.b * material.metallicFactor;
    var roughness = mr.g * material.roughnessFactor;
    roughness = max(roughness, MIN_ROUGHNESS);
    let alpha = roughness * roughness;

    let occlusion = textureSample(occlusionTexture, pbrSampler, in.uv).r;
    let emissive = textureSample(emissiveTexture, pbrSampler, in.uv).rgb * material.emissiveFactor;

    let nSampled = textureSample(normalTexture, pbrSampler, in.uv).rgb * 2.0 - vec3f(1.0);
    let nScaled = vec3f(nSampled.xy * material.normalScale, nSampled.z);
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

    let ambient = (diffuseIbl + specularIbl) * mix(1.0, occlusion, material.occlusionStrength);

    // --- Direct light (keeps parity with the direct renderer's single light) ---
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
