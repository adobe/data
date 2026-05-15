// © 2026 Adobe. MIT License. See /LICENSE for details.

import iblMath from "./ibl-math.wgsl.js";
import { createCubemap, cubeFaceView, cubemapSampleView, FULLSCREEN_VS } from "./render-helpers.js";

// Cosine-weighted hemispherical Monte-Carlo convolution of the source
// environment. With cos-weighted PDF, irradiance/π = mean(L(ωi)) — no extra
// factor needed. 1024 samples is plenty for a 32x32 output.
const IRRADIANCE_FS = /* wgsl */ `
struct Params { face: u32, size: u32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var envMap: texture_cube<f32>;
@group(0) @binding(2) var envSampler: sampler;

const SAMPLES: u32 = 1024u;

fn convolve(N: vec3f) -> vec3f {
    let up = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(N.z) < 0.999);
    let tangent = normalize(cross(up, N));
    let bitangent = cross(N, tangent);

    var acc = vec3f(0.0);
    for (var i = 0u; i < SAMPLES; i = i + 1u) {
        let xi = hammersley(i, SAMPLES);
        let phi = 2.0 * PI * xi.x;
        let cosTheta = sqrt(xi.y);
        let sinTheta = sqrt(1.0 - xi.y);
        let local = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        let dir = normalize(tangent * local.x + bitangent * local.y + N * local.z);
        acc = acc + textureSampleLevel(envMap, envSampler, dir, 0.0).rgb;
    }
    return acc / f32(SAMPLES);
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let uv = frag.xy / f32(params.size);
    let N = cube_uv_to_dir(params.face, uv);
    return vec4f(convolve(N), 1.0);
}
`;

export function generateIrradiance(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    envMap: GPUTexture,
    size: number,
): GPUTexture {
    const format: GPUTextureFormat = "rgba16float";
    const texture = createCubemap(device, size, format, 1);

    const module = device.createShaderModule({ code: FULLSCREEN_VS + iblMath + IRRADIANCE_FS });
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

    for (let face = 0; face < 6; face++) {
        const ub = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(ub, 0, new Uint32Array([face, size, 0, 0]));
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
                view: cubeFaceView(texture, face, 0),
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

    return texture;
}
