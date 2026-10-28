// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, type F32, Gpu, Mat4x4, System, type U32, Vec3 } from '@adobe/ecs';
import { Cache, Frame, View } from '@adobe/ecs-gpu';

// The ECS's perf particles (its src/perftest/particles.ts) on screen: 1M particles over four archetypes by visible and
// enabled, with screen-space positions and velocities in pixels per frame. `move` is the perf move kernel, on the GPU.

export const position = Symbol();
export const velocity = Symbol();
export const color = Symbol();
export const mass = Symbol();
export const visible = Symbol();
export const enabled = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [color]: { type: U32 };
        [mass]: { type: F32 };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}

/** Entity i goes to archetype i % 4. */
const archetypes = [
    [color, mass, position, velocity, visible, enabled] as const,
    [color, mass, position, velocity, visible] as const,
    [color, mass, position, velocity, enabled] as const,
    [color, mass, position, velocity] as const,
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
    kernel: "gpu",
    components: { with: [velocity, position, visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

/** The same move on the CPU, for comparison. */
export const moveOnCpu = System.create({
    kernel: true,
    components: { with: [velocity, position, visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
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

const declaration = {
    components: { with: [visible, enabled] },
    shader: { group: 0, accessors: { particlePosition: position, particleColor: color } },
    after: [move, moveOnCpu, Frame.update],
    before: [Frame.present],
} as const;

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

/** A view of the whole of a surface, drawing particles in its pixels. */
export const spawnView = System.create({}, ({ commands }, input: { readonly surface: Entity }) => {
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: input.surface, [View.viewport]: [0, 0, 1, 1], [View.projection]: Mat4x4.identity });
});
