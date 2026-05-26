// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Bind group layout for the SceneUniforms uniform buffer. Stable across the
 * renderer pipeline (consumer) and `_sceneUniforms` system (producer).
 * WebGPU compares layouts structurally, so creating two layout objects from
 * this descriptor is safe.
 */
export function createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    return device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            },
        ],
    });
}
