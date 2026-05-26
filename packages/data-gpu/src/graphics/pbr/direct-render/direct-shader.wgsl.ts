// © 2026 Adobe. MIT License. See /LICENSE for details.

import { wgslStructFields } from "@adobe/data/typed-buffer";
import { schema as sceneUniformsSchema } from "../../scene-uniforms/schema.js";
import { schema as visibleMaterialSchema } from "../visible-material/schema.js";
import brdf from "../ibl-render/brdf.wgsl.js";

export default /* wgsl */ `
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

@group(2) @binding(0) var<storage, read> instances: array<mat4x4<f32>>;

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
    return out;
}

${brdf}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let baseColorSample = textureSample(baseColorTexture, pbrSampler, in.uv);
    let baseColor = baseColorSample * material.baseColorFactor;

    let mrSample = textureSample(metallicRoughnessTexture, pbrSampler, in.uv);
    let metallic = mrSample.b * material.metallicFactor;
    var roughness = mrSample.g * material.roughnessFactor;
    roughness = max(roughness, MIN_ROUGHNESS);
    let alpha = roughness * roughness;

    let occlusion = textureSample(occlusionTexture, pbrSampler, in.uv).r;
    let emissive = textureSample(emissiveTexture, pbrSampler, in.uv).rgb * material.emissiveFactor;

    let nSampled = textureSample(normalTexture, pbrSampler, in.uv).rgb * 2.0 - vec3f(1.0);
    let nScaled = vec3f(nSampled.xy * material.normalScale, nSampled.z);
    let tbn = mat3x3<f32>(in.tangent, in.bitangent, in.normal);
    let N = normalize(tbn * nScaled);

    let V = normalize(scene.cameraPosition - in.worldPosition);
    let L = normalize(-scene.lightDirection);
    let H = normalize(V + L);

    let nDotL = max(dot(N, L), 0.0);
    let nDotV = max(dot(N, V), 0.0001);
    let nDotH = max(dot(N, H), 0.0);
    let vDotH = max(dot(V, H), 0.0);

    let f0 = mix(vec3f(0.04), baseColor.rgb, metallic);

    let D = d_ggx(nDotH, alpha);
    let G = g_smith(nDotV, nDotL, alpha);
    let F = f_schlick(vDotH, f0);

    let specular = (D * G * F) / (4.0 * nDotV * nDotL + 0.0001);

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - metallic);
    let diffuse = kD * baseColor.rgb / PI;

    let direct = (diffuse + specular) * scene.lightColor * nDotL;
    let ambient = baseColor.rgb * scene.lightColor * scene.ambientStrength * mix(1.0, occlusion, material.occlusionStrength);

    let color = direct + ambient + emissive;

    // Reinhard tone-map + gamma. Adequate for the direct-lighting path; the IBL
    // plugin should swap this for ACES or a filmic curve once HDR reflections
    // make brightness range much wider.
    let mapped = color / (color + vec3f(1.0));
    let gamma = pow(mapped, vec3f(1.0 / 2.2));

    return vec4f(gamma, baseColor.a);
}
`;
