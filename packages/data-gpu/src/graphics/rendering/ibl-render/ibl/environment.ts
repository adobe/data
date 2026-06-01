// © 2026 Adobe. MIT License. See /LICENSE for details.

import { floatArrayToHalf } from "./float-to-half.js";
import iblMath from "./ibl-math.wgsl.js";
import type { ParsedHdr } from "./parse-hdr.js";
import { createCubemap, cubeFaceView, FULLSCREEN_VS } from "./render-helpers.js";

const ENV_PROCEDURAL_FS = /* wgsl */ `
struct Params { face: u32, size: u32 };
@group(0) @binding(0) var<uniform> params: Params;

fn env_color(dir: vec3f) -> vec3f {
    let sky_top = vec3f(0.45, 0.55, 0.75);
    let horizon = vec3f(0.18, 0.20, 0.24);
    let ground  = vec3f(0.08, 0.08, 0.10);
    var color = mix(horizon, sky_top, smoothstep(-0.05, 0.65, dir.y));
    color = mix(ground, color, smoothstep(-0.3, 0.0, dir.y));

    let warm = vec3f(9.0, 7.2, 5.0);
    let cool = vec3f(5.0, 7.5, 10.0);
    for (var i = 0u; i < 4u; i = i + 1u) {
        let a = f32(i) * 1.5707963;
        let ld = normalize(vec3f(sin(a) * 0.55, 0.85, cos(a) * 0.55));
        let d = max(dot(dir, ld), 0.0);
        let intensity = pow(d, 96.0);
        let lc = select(warm, cool, i % 2u == 0u);
        color = color + intensity * lc;
    }
    return color;
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let uv = frag.xy / f32(params.size);
    let dir = cube_uv_to_dir(params.face, uv);
    return vec4f(env_color(dir), 1.0);
}
`;

const ENV_EQUIRECT_FS = /* wgsl */ `
struct Params { face: u32, size: u32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var equirect: texture_2d<f32>;
@group(0) @binding(2) var equirectSampler: sampler;

fn dir_to_equirect_uv(d: vec3f) -> vec2f {
    let theta = atan2(d.z, d.x);
    let phi = asin(clamp(d.y, -1.0, 1.0));
    return vec2f((theta + PI) / (2.0 * PI), 0.5 - phi / PI);
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let uv = frag.xy / f32(params.size);
    let dir = cube_uv_to_dir(params.face, uv);
    let env_uv = dir_to_equirect_uv(dir);
    return textureSampleLevel(equirect, equirectSampler, env_uv, 0.0);
}
`;

function uploadHdrAsTexture(device: GPUDevice, hdr: ParsedHdr): GPUTexture {
    const halfData = floatArrayToHalf(hdr.rgba);
    const texture = device.createTexture({
        size: [hdr.width, hdr.height, 1],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
        { texture },
        halfData.buffer,
        { bytesPerRow: hdr.width * 8 },
        [hdr.width, hdr.height, 1],
    );
    return texture;
}

function makeProceduralPipeline(device: GPUDevice, format: GPUTextureFormat) {
    const module = device.createShaderModule({ code: FULLSCREEN_VS + iblMath + ENV_PROCEDURAL_FS });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: { module, entryPoint: "vs_fullscreen" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });
    return { pipeline, bindGroupLayout };
}

function makeEquirectPipeline(device: GPUDevice, format: GPUTextureFormat) {
    const module = device.createShaderModule({ code: FULLSCREEN_VS + iblMath + ENV_EQUIRECT_FS });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: { module, entryPoint: "vs_fullscreen" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });
    return { pipeline, bindGroupLayout };
}

/**
 * Renders an environment cubemap. With no `hdr` source it falls back to the
 * built-in procedural studio. Pass a parsed Radiance HDR for a real photoreal
 * environment — used by the IBL plugin to enable Babylon-style glossy
 * reflections.
 */
export function generateEnvironment(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    size: number,
    hdr?: ParsedHdr,
): GPUTexture {
    const format: GPUTextureFormat = "rgba16float";
    const texture = createCubemap(device, size, format, 1);

    if (hdr) {
        const equirectTexture = uploadHdrAsTexture(device, hdr);
        const sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat",
            addressModeV: "clamp-to-edge",
        });
        const { pipeline, bindGroupLayout } = makeEquirectPipeline(device, format);
        const equirectView = equirectTexture.createView();

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
                    { binding: 1, resource: equirectView },
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

    const { pipeline, bindGroupLayout } = makeProceduralPipeline(device, format);
    for (let face = 0; face < 6; face++) {
        const ub = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(ub, 0, new Uint32Array([face, size, 0, 0]));
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: ub } }],
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
