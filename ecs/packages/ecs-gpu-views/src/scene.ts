// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, type Entity, type F32, Gpu, Mat4x4, System, type Vec3 } from '@adobe/ecs';
import { Cache, Frame, Target, View } from '@adobe/ecs-gpu';

// The views sample's keys and systems, which both threads import: points turning around the vertical axis, drawn into
// every view, each view's camera aiming its projection.

/** A point's place, its turn in radians per second, and its hue from 0 to 1. */
export const place = Symbol();
export const spin = Symbol();
export const hue = Symbol();
/** Where a view's camera looks from. */
export const camera = Symbol();
/** Frames the world drew. */
export const frames = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [place]: { type: Vec3 };
        [spin]: { type: F32 };
        [hue]: { type: F32 };
        [camera]: { type: "orbit" | "side" | "above" };
    }
    interface Resources {
        [frames]: { type: number };
    }
}

/** Points in a ring of rings, turning at speeds of their own. */
export const spawnPoints = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        const angle = i * 2.399963;
        const radius = 1 + (i % 64) / 32;
        commands.spawn([place, spin, hue])({
            [place]: [Math.cos(angle) * radius, ((i * 7) % 97) / 97 - 0.5, Math.sin(angle) * radius],
            [spin]: 0.2 + (i % 5) * 0.1,
            [hue]: (i % 360) / 360,
        });
    }
});

/** Two views side by side on the main surface, and one from above on the map's. */
export const spawnViews = System.create({}, ({ commands }, input: { readonly main: Entity; readonly map: Entity }) => {
    const views = [[input.main, [0, 0, 0.5, 1], "orbit"], [input.main, [0.5, 0, 0.5, 1], "side"], [input.map, [0, 0, 1, 1], "above"]] as const;
    for (const [surface, viewport, looking] of views) {
        commands.spawn([View.target, View.viewport, View.projection, camera])({ [View.target]: surface, [View.viewport]: viewport, [View.projection]: Mat4x4.identity, [camera]: looking });
    }
});

/** Turns each point around the vertical axis. */
export const turn = System.create({ kernel: "gpu", components: { with: [place, spin] } }, (row, { resources }) => {
    const angle = row[spin] * resources[clock].delta / 1000;
    const [x, y, z] = row[place];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    row[place] = [x * cos - z * sin, y, x * sin + z * cos];
});

/** Aims each view's camera, its projection fitting the view's shape on its surface. */
export const aim = System.create({
    components: { with: [camera, View.target, View.viewport, View.projection] },
    lookup: { targets: { with: [Target.size] } },
    before: [Frame.update],
}, (row, { resources, lookup }) => {
    const [width, height] = lookup.targets(row[View.target])?.[Target.size] ?? [1, 1];
    const [, , across, down] = row[View.viewport];
    const aspect = (across * width) / Math.max(1, down * height);
    const seconds = resources[clock].now / 1000;
    const eye: Vec3 = row[camera] === "above" ? [0, 8, 0.001] : row[camera] === "side" ? [6, 0.5, 0] : [Math.cos(seconds * 0.3) * 6, 2.5, Math.sin(seconds * 0.3) * 6];
    row[View.projection] = Mat4x4.multiply(Mat4x4.perspective(Math.PI / 4, aspect, 0.1, 50), Mat4x4.lookAt(eye, [0, 0, 0], [0, 1, 0]));
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

/** Draws every point into every view. */
export const draw = System.render({
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

/** Counts frames, for the page's overlay. */
const count = System.create({}, ({ resources }) => { resources[frames] = resources[frames] + 1; });

/** A frame: points turned, cameras aimed, then every view drawn and the surfaces presented. */
export const frame = System.create({ systems: [turn, aim, Frame.systems, draw, count] });
