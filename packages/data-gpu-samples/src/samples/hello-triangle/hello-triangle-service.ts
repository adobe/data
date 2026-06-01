// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "@adobe/data-gpu";

const triangleShader = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
    var pos = array<vec2f, 3>(
        vec2f( 0.0,  0.5),
        vec2f(-0.5, -0.5),
        vec2f( 0.5, -0.5),
    );
    var colors = array<vec4f, 3>(
        vec4f(1.0, 0.0, 0.0, 1.0),
        vec4f(0.0, 1.0, 0.0, 1.0),
        vec4f(0.0, 0.0, 1.0, 1.0),
    );
    var out: VertexOutput;
    out.position = vec4f(pos[i], 0.0, 1.0);
    out.color = colors[i];
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    return in.color;
}
`;

export const helloTrianglePlugin = Database.Plugin.create({
    extends: core,
    systems: {
        hello_triangle_render: {
            create: db => {
                let pipeline: GPURenderPipeline | null = null;
                return () => {
                    const { device, renderPassEncoder, canvasFormat, depthFormat } = db.store.resources;
                    if (!device || !renderPassEncoder) return;

                    if (!pipeline) {
                        const module = device.createShaderModule({ code: triangleShader });
                        pipeline = device.createRenderPipeline({
                            layout: "auto",
                            vertex: { module, entryPoint: "vs_main" },
                            fragment: { module, entryPoint: "fs_main", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list" },
                            depthStencil: {
                                format: depthFormat,
                                depthWriteEnabled: true,
                                depthCompare: "less",
                            },
                        });
                    }

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.draw(3);
                };
            },
            schedule: { during: ["render"] }
        },
    },
});

export type HelloTriangleService = Database.Plugin.ToDatabase<typeof helloTrianglePlugin>;
