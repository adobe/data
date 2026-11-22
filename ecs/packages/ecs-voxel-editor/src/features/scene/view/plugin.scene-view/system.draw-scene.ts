// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Gpu, System } from "@adobe/ecs";
import { Cache, Frame, View } from "@adobe/ecs-gpu";
import { position, voxel } from "../../../voxels/model/index.js";
import { drawnVoxels } from "./index.drawn-voxels.js";
import { drawList } from "./resource.draw-list.js";
import { materialSlot } from "./component.material-slot.js";
import { paintSlot } from "./component.paint-slot.js";
import { shaders } from "./constant.shaders.js";
import { sceneBinding } from "./function.scene-binding.js";
import { materialTable } from "./resource.material-table.js";
import { scene } from "./resource.scene.js";
import { bindDrawList } from "./system.bind-draw-list.js";

/**
 * Draws the scene into its view: the sky, the edited model's far walls and axes, then each model's voxels once per place
 * it appears, straight from the GPU copy of their `position`, `materialSlot` and `paintSlot`, which the world uploads from storage as
 * they change: in `drawnVoxels`' order, a model's voxels a range of it, drawn with that place's matrix.
 */
export const drawScene: System = System.render({
    components: { with: [voxel] },
    order: drawnVoxels,
    shader: { group: 0, accessors: { voxelPosition: position, voxelSlot: materialSlot, voxelPaint: paintSlot } },
    after: [Frame.update, bindDrawList],
    before: [Frame.present],
}, ({ device, encoder, tables }, { resources }) => {
    const list = resources[drawList];
    const binding = sceneBinding(device, resources[scene], list, resources[materialTable]);
    if (binding.scene === null || list === null) return;
    for (const view of resources[View.states]?.values() ?? []) {
        const { format, options } = view.target;
        const made = pipelines(device, { format, sampleCount: options.sampleCount, depthFormat: options.depthFormat });
        const pass = View.begin(encoder, view);
        pass.setBindGroup(0, binding.emptyGroup);
        pass.setBindGroup(1, view.bindGroup);
        pass.setBindGroup(2, binding.group);
        pass.setPipeline(made.sky);
        pass.draw(3);
        pass.setPipeline(made.wall);
        pass.draw(36);
        pass.setPipeline(made.axis);
        pass.draw(36, 3);
        pass.setPipeline(made.voxel);
        for (const table of tables) {
            table.bind(pass);
            list.draws.forEach((draw, i) => {
                pass.setBindGroup(3, binding.placementGroup, [i * binding.stride]);
                pass.draw(36, draw.count, 0, draw.start);
            });
        }
        pass.end();
    }
});

/** What a pipeline depends on of the target it draws into. */
type Drawn = { readonly format: GPUTextureFormat; readonly sampleCount: number; readonly depthFormat: GPUTextureFormat | null };

/**
 * Each program's pipeline for a device and target, compiled as the first frame needs it: synchronously, so that frame
 * draws, as nothing would ask for another once one compiled apart had finished.
 */
const pipelines = Cache.perDevice((device: GPUDevice, drawn: Drawn) => {
    const { layout, empty, placementLayout } = sceneBinding(device, null, null, null);
    const views = View.layout(device);
    const world = device.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(device), views, layout, placementLayout] });
    const backdrop = device.createPipelineLayout({ bindGroupLayouts: [empty, views, layout] });
    const header = `${View.wgsl(1)}${shaders.common}`;
    const compile = (code: string, pipelineLayout: GPUPipelineLayout, cullMode: GPUCullMode, depthWrite: boolean): GPURenderPipeline => {
        const module = device.createShaderModule({ code });
        return device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: { module, entryPoint: "vertexMain" },
            fragment: { module, entryPoint: "fragmentMain", targets: [{ format: drawn.format }] },
            primitive: { topology: "triangle-list", cullMode },
            depthStencil: drawn.depthFormat === null ? undefined : { format: drawn.depthFormat, depthCompare: depthWrite ? "less" : "less-equal", depthWriteEnabled: depthWrite },
            multisample: { count: drawn.sampleCount },
        });
    };
    return {
        sky: compile(`${header}${shaders.sky}`, backdrop, "none", false),
        wall: compile(`${header}${shaders.wall}`, backdrop, "front", true),
        axis: compile(`${header}${shaders.axis}`, backdrop, "back", true),
        voxel: compile(`${Gpu.wgsl(drawScene)}${header}${shaders.voxel}`, world, "back", true),
    };
});
