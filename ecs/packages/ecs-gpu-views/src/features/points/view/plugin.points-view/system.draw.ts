// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Gpu, System } from '@adobe/ecs';
import { Cache, Frame, View } from '@adobe/ecs-gpu';
import { hue, place, turn } from '../../model/index.js';

/** Draws every point into every view. */
export const draw: System = System.render({
    shader: { group: 0, accessors: { pointPlace: place, pointHue: hue } },
    after: [turn, Frame.update],
    before: [Frame.present],
}, ({ device, encoder, tables }, { resources }) => {
    for (const view of resources[View.states]?.values() ?? []) {
        const { format, options } = view.target;
        const pass = View.begin(encoder, view);
        pass.setPipeline(pipelines(device, { format, sampleCount: options.sampleCount, depthFormat: options.depthFormat }));
        pass.setBindGroup(1, view.bindGroup);
        for (const table of tables) {
            table.bind(pass);
            pass.draw(6, table.count);
        }
        pass.end();
    }
});

/** Each point as a small square facing the view, colored by its hue, after the views' own declarations. */
const shader = `
struct Corner { @builtin(position) position: vec4f, @location(0) color: vec3f }

@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) row: u32) -> Corner {
    let corners = array(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
    let clip = view.projection * vec4f(pointPlace(row), 1.0);
    let offset = corners[vertex] * 3.0 / view.size * clip.w;
    let h = pointHue(row) * 6.0;
    let color = clamp(vec3f(abs(h - 3.0) - 1.0, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), vec3f(0.0), vec3f(1.0));
    return Corner(vec4f(clip.xy + offset, clip.zw), color);
}

@fragment fn fragmentMain(corner: Corner) -> @location(0) vec4f { return vec4f(corner.color, 1.0); }
`;

/** What a pipeline depends on of the target it draws into. */
type Drawn = { readonly format: GPUTextureFormat; readonly sampleCount: number; readonly depthFormat: GPUTextureFormat | null };

const pipelines = Cache.perDevice((device: GPUDevice, drawn: Drawn) => {
    const module = device.createShaderModule({ code: `${Gpu.wgsl(draw)}${View.wgsl(1)}${shader}` });
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(device), View.layout(device)] }),
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "fragmentMain", targets: [{ format: drawn.format }] },
        depthStencil: drawn.depthFormat === null ? undefined : { format: drawn.depthFormat, depthCompare: "less", depthWriteEnabled: true },
        multisample: { count: drawn.sampleCount },
    });
});
