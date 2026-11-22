// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Gpu, System } from "@adobe/ecs";
import { Cache, Frame, View } from "@adobe/ecs-gpu";
import { faceCell, faces, faceSide } from "../../../selection/model/index.js";
import { drawList } from "./resource.draw-list.js";
import { shaders } from "./constant.shaders.js";
import { sceneBinding } from "./function.scene-binding.js";
import { materialTable } from "./resource.material-table.js";
import { scene } from "./resource.scene.js";
import { drawScene } from "./system.draw-scene.js";

/**
 * Draws the edited model's selected faces over the scene, through its matrix, straight from the GPU copy of their
 * `faceCell` and `faceSide`: in `faces`' order, its faces a range of it.
 */
export const drawSelection: System = System.render({
    order: faces,
    shader: { group: 0, accessors: { faceCellOf: faceCell, faceSideOf: faceSide } },
    after: [drawScene],
    before: [Frame.present],
}, ({ device, encoder, tables }, { resources }) => {
    const list = resources[drawList];
    const binding = sceneBinding(device, resources[scene], list, resources[materialTable]);
    if (binding.scene === null || list === null || list.faces.count === 0) return;
    for (const view of resources[View.states]?.values() ?? []) {
        const { format, options } = view.target;
        const pipeline = pipelines(device, { format, sampleCount: options.sampleCount, depthFormat: options.depthFormat });
        const pass = View.begin(encoder, view);
        pass.setPipeline(pipeline);
        pass.setBindGroup(1, view.bindGroup);
        pass.setBindGroup(2, binding.group);
        for (const table of tables) {
            table.bind(pass);
            pass.draw(6, list.faces.count, 0, list.faces.start);
        }
        pass.end();
    }
});

/** What a pipeline depends on of the target it draws into. */
type Drawn = { readonly format: GPUTextureFormat; readonly sampleCount: number; readonly depthFormat: GPUTextureFormat | null };

/** The faces' pipeline for a device and target, translucent and writing no depth, compiled as the first frame needs it, as the scene's are. */
const pipelines = Cache.perDevice((device: GPUDevice, drawn: Drawn) => {
    const module = device.createShaderModule({ code: `${Gpu.wgsl(drawSelection)}${View.wgsl(1)}${shaders.common}${shaders.face}` });
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(device), View.layout(device), sceneBinding(device, null, null, null).layout] }),
        vertex: { module, entryPoint: "vertexMain" },
        fragment: {
            module, entryPoint: "fragmentMain",
            targets: [{ format: drawn.format, blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: drawn.depthFormat === null ? undefined : { format: drawn.depthFormat, depthCompare: "less-equal", depthWriteEnabled: false },
        multisample: { count: drawn.sampleCount },
    });
});
