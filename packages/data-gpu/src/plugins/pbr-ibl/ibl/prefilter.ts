// © 2026 Adobe. MIT License. See /LICENSE for details.

import iblMath from "./ibl-math.wgsl.js";
import { createCubemap, cubeFaceView, cubemapSampleView, FULLSCREEN_VS } from "./render-helpers.js";

// Split-sum prefiltered specular: each mip stores GGX importance-sampled
// reflections at a fixed roughness. Mip 0 = mirror (roughness 0), mip max =
// fully blurred (roughness 1). Uses Karis' simplification of N == V == R.
const PREFILTER_FS = /* wgsl */ `
struct Params { face: u32, size: u32, roughness: f32, _pad: f32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var envMap: texture_cube<f32>;
@group(0) @binding(2) var envSampler: sampler;

const SAMPLES: u32 = 1024u;

fn prefilter(N: vec3f) -> vec3f {
    if (params.roughness < 0.001) {
        return textureSampleLevel(envMap, envSampler, N, 0.0).rgb;
    }
    let V = N;
    var color = vec3f(0.0);
    var weight = 0.0;
    for (var i = 0u; i < SAMPLES; i = i + 1u) {
        let xi = hammersley(i, SAMPLES);
        let H = importance_sample_ggx(xi, N, params.roughness);
        let L = normalize(2.0 * dot(V, H) * H - V);
        let nDotL = max(dot(N, L), 0.0);
        if (nDotL > 0.0) {
            color = color + textureSampleLevel(envMap, envSampler, L, 0.0).rgb * nDotL;
            weight = weight + nDotL;
        }
    }
    return color / max(weight, 0.0001);
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let uv = frag.xy / f32(params.size);
    let N = cube_uv_to_dir(params.face, uv);
    return vec4f(prefilter(N), 1.0);
}
`;

export interface PrefilteredResult {
    texture: GPUTexture;
    mipLevelCount: number;
}

export function generatePrefiltered(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    envMap: GPUTexture,
    baseSize: number,
    mipLevelCount: number,
): PrefilteredResult {
    const format: GPUTextureFormat = "rgba16float";
    const texture = createCubemap(device, baseSize, format, mipLevelCount);

    const module = device.createShaderModule({ code: FULLSCREEN_VS + iblMath + PREFILTER_FS });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: { module, entryPoint: "vs_fullscreen" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        addressModeW: "clamp-to-edge",
    });
    const envView = cubemapSampleView(envMap);

    for (let mip = 0; mip < mipLevelCount; mip++) {
        const mipSize = Math.max(1, baseSize >> mip);
        const roughness = mipLevelCount > 1 ? mip / (mipLevelCount - 1) : 0;
        for (let face = 0; face < 6; face++) {
            const ub = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            const buf = new ArrayBuffer(16);
            new Uint32Array(buf, 0, 2).set([face, mipSize]);
            new Float32Array(buf, 8, 2).set([roughness, 0]);
            device.queue.writeBuffer(ub, 0, buf);

            const bindGroup = device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: ub } },
                    { binding: 1, resource: envView },
                    { binding: 2, resource: sampler },
                ],
            });
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: cubeFaceView(texture, face, mip),
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: [0, 0, 0, 1],
                }],
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
        }
    }

    return { texture, mipLevelCount };
}
