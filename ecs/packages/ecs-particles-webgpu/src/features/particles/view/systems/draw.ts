// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Gpu, System } from '@adobe/ecs';
import { Cache, Frame, View } from '@adobe/ecs-gpu';
import { color, enabled, move, moveOnCpu, position, visible } from '../../model/index.js';

const declaration = {
    components: { with: [visible, enabled] },
    shader: { group: 0, accessors: { particlePosition: position, particleColor: color } },
    after: [move, moveOnCpu, Frame.update],
    before: [Frame.present],
} as const;

/**
 * Draws the visible and enabled particles as points into every view, wrapping positions so particles leaving one side
 * of the field come back on the other; a view draws once its pipeline is compiled.
 */
export const draw = System.render(declaration, ({ device, encoder, tables }, { resources }) => {
    for (const view of resources[View.states]?.values() ?? []) {
        const { pipeline } = pipelines(device, view.target.format);
        if (pipeline === null) continue;
        const pass = View.begin(encoder, view);
        pass.setPipeline(pipeline);
        pass.setBindGroup(1, view.bindGroup);
        for (const table of tables) {
            table.bind(pass);
            pass.draw(table.count);
        }
        pass.end();
    }
});

/** The vertex and fragment stages, after the world's declarations and the view's: each particle is a point, wrapped into the view. */
const shader = `
struct Point { @builtin(position) position: vec4f, @location(0) color: vec4f }

@vertex fn vertexMain(@builtin(vertex_index) row: u32) -> Point {
    let p = particlePosition(row).xy;
    let wrapped = p - floor(p / view.size) * view.size;
    let clip = wrapped / view.size * 2.0 - 1.0;
    return Point(vec4f(clip.x, -clip.y, 0.0, 1.0), unpack4x8unorm(particleColor(row)));
}

@fragment fn fragmentMain(point: Point) -> @location(0) vec4f { return point.color; }
`;

/** Each device's pipeline for each target format, null until it's compiled. */
const pipelines = Cache.perDevice((device: GPUDevice, format: GPUTextureFormat) => {
    const made = { pipeline: null as GPURenderPipeline | null };
    const module = device.createShaderModule({ code: `${Gpu.wgsl(draw)}${View.wgsl(1)}${shader}` });
    void device.createRenderPipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(device), View.layout(device)] }),
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
        primitive: { topology: "point-list" },
    }).then(pipeline => { made.pipeline = pipeline; });
    return made;
}, format => format);
