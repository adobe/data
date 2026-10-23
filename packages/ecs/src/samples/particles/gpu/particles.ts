// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype, Component, Gpu, System, Vec3 } from '../../../index.js';

// The perf particles (src/perftest/particles.ts) on screen: 1M particles over four archetypes by visible and
// enabled, with screen-space positions and velocities in pixels per frame. `move` is the perf move kernel, on the GPU.

export const position = Symbol("gpuParticles/position");
export const velocity = Symbol("gpuParticles/velocity");
export const color = Symbol("gpuParticles/color");
export const mass = Symbol("gpuParticles/mass");
export const visible = Symbol("gpuParticles/visible");
export const enabled = Symbol("gpuParticles/enabled");

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [color]: { type: number };
        [mass]: { type: number };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(color, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
Component.register(mass, { type: { type: "number", precision: 1 } });
Component.register(visible, { type: { const: true } });
Component.register(enabled, { type: { const: true } });

/** Entity i goes to archetype i % 4. */
const archetypes = [
    Archetype.create([color, mass, position, velocity, visible, enabled]),
    Archetype.create([color, mass, position, velocity, visible]),
    Archetype.create([color, mass, position, velocity, enabled]),
    Archetype.create([color, mass, position, velocity]),
] as const;

/** A deterministic sequence in [0, 1), so every mode starts from the same particles. */
const random = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
};

/** The particle count, and the field's width and height in pixels. Entity i goes to archetype i % 4. */
export const spawn = System.create({
    name: "gpuParticles/spawn",
}, ({ commands }, { count, width, height }: { readonly count: number; readonly width: number; readonly height: number }) => {
    const next = random(7);
    for (let i = 0; i < count; i++) {
        const p = [next() * width, next() * height, 0] as const;
        const angle = next() * Math.PI * 2;
        const speed = 0.25 + next() * 1.75;
        const v = [Math.cos(angle) * speed, Math.sin(angle) * speed, 0] as const;
        // Opaque, in the colors' upper half so they show on black: RGBA bytes, red lowest.
        const rgb = 0x808080 | Math.floor(next() * 0x1000000);
        commands.spawn(archetypes[i % 4])({ [color]: (0xff000000 | rgb) >>> 0, [mass]: 1, [position]: p, [velocity]: v });
    }
});

export const move = System.create({
    name: "gpuParticles/move",
    kernel: "gpu",
    components: { read: [velocity], write: [position], has: [visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

/** The same move on the CPU, for comparison. */
export const moveOnCpu = System.create({
    name: "gpuParticles/moveOnCpu",
    kernel: "cpu",
    components: { read: [velocity], write: [position], has: [visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

/** The vertex and fragment stages, after the world's declarations: each particle is a point, wrapped into the field. */
const shader = `
struct View { size: vec2f }
@group(1) @binding(0) var<uniform> view: View;

struct Point { @builtin(position) position: vec4f, @location(0) color: vec4f }

@vertex fn vertexMain(@builtin(vertex_index) row: u32) -> Point {
    let p = particlePosition(row).xy;
    let wrapped = p - floor(p / view.size) * view.size;
    let clip = wrapped / view.size * 2.0 - 1.0;
    return Point(vec4f(clip.x, -clip.y, 0.0, 1.0), unpack4x8unorm(particleColor(row)));
}

@fragment fn fragmentMain(point: Point) -> @location(0) vec4f { return point.color; }
`;

const declaration = {
    name: "gpuParticles/draw",
    components: { has: [visible, enabled] },
    shader: { group: 0, accessors: { particlePosition: position, particleColor: color } },
    after: [move, moveOnCpu],
} as const;

/**
 * The render system for a canvas: it draws the visible and enabled particles as points, wrapping positions so
 * particles leaving one side of the field come back on the other. `layout` is the world's GPU layout.
 */
export const createDraw = (device: GPUDevice, layout: GPUBindGroupLayout, context: GPUCanvasContext, format: GPUTextureFormat) => {
    const viewLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }] });
    const viewBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const viewGroup = device.createBindGroup({ layout: viewLayout, entries: [{ binding: 0, resource: { buffer: viewBuffer } }] });
    let pipeline: GPURenderPipeline | null = null;
    const draw = System.render(declaration, ({ encoder, tables }) => {
        if (pipeline === null) return;
        const texture = context.getCurrentTexture();
        device.queue.writeBuffer(viewBuffer, 0, new Float32Array([texture.width, texture.height]));
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(1, viewGroup);
        for (const table of tables) {
            table.bind(pass);
            pass.draw(table.count);
        }
        pass.end();
    });
    const module = device.createShaderModule({ code: `${Gpu.wgsl(draw)}${shader}` });
    const ready = (async () => {
        pipeline = await device.createRenderPipelineAsync({
            layout: device.createPipelineLayout({ bindGroupLayouts: [layout, viewLayout] }),
            vertex: { module, entryPoint: "vertexMain" },
            fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
            primitive: { topology: "point-list" },
        });
    })();
    return { draw, ready };
};
