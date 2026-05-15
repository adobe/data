// © 2026 Adobe. MIT License. See /LICENSE for details.

import iblMath from "./ibl-math.wgsl.js";
import { FULLSCREEN_VS } from "./render-helpers.js";

// Karis split-sum BRDF integration. Encodes the F0-independent part of the
// specular IBL integral. Lookup is (NdotV, roughness) → (scale, bias) such
// that specular_IBL = prefiltered * (F0 * scale + bias).
const BRDF_LUT_FS = /* wgsl */ `
struct Params { size: u32, _pad: u32, _pad2: u32, _pad3: u32 };
@group(0) @binding(0) var<uniform> params: Params;

const SAMPLES: u32 = 1024u;

fn integrate(nDotV: f32, roughness: f32) -> vec2f {
    let V = vec3f(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
    // N = (0,0,1): work directly in tangent space. importance_sample_ggx's
    // TBN frame degenerates when N=(0,0,1), so we sample H inline here.
    let a = roughness * roughness;

    var A = 0.0;
    var B = 0.0;
    for (var i = 0u; i < SAMPLES; i = i + 1u) {
        let xi = hammersley(i, SAMPLES);
        let phi = 2.0 * PI * xi.x;
        let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
        let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
        let H = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        let L = normalize(2.0 * dot(V, H) * H - V);
        let nDotL = max(L.z, 0.0);
        let nDotH = max(H.z, 0.0);
        let vDotH = max(dot(V, H), 0.0);
        if (nDotL > 0.0) {
            let G = g_smith_ibl(nDotV, nDotL, roughness);
            let g_vis = (G * vDotH) / max(nDotH * nDotV, 0.0001);
            let fc = pow(1.0 - vDotH, 5.0);
            A = A + (1.0 - fc) * g_vis;
            B = B + fc * g_vis;
        }
    }
    return vec2f(A, B) / f32(SAMPLES);
}

@fragment
fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let uv = frag.xy / f32(params.size);
    let nDotV = max(uv.x, 0.001);
    let roughness = max(uv.y, 0.04);
    let r = integrate(nDotV, roughness);
    return vec4f(r, 0.0, 1.0);
}
`;

export function generateBrdfLut(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    size = 256,
): GPUTexture {
    const format: GPUTextureFormat = "rgba16float";
    const texture = device.createTexture({
        size: [size, size, 1],
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const module = device.createShaderModule({ code: FULLSCREEN_VS + iblMath + BRDF_LUT_FS });
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: { module, entryPoint: "vs_fullscreen" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

    const ub = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(ub, 0, new Uint32Array([size, 0, 0, 0]));
    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: ub } }],
    });

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: texture.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 1],
        }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    return texture;
}
