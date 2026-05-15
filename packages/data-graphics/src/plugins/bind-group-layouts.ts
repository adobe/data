// © 2026 Adobe. MIT License. See /LICENSE for details.

// Bind group layout descriptors are stable between the renderer (pipeline creation)
// and the loader (per-material bind group creation). WebGPU compares layouts
// structurally for compatibility, so creating two layout objects from the same
// descriptor is safe.

export function createSceneBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
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

export function createMaterialBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    const textureEntry = (binding: number): GPUBindGroupLayoutEntry => ({
        binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
    });
    return device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            },
            textureEntry(1),
            textureEntry(2),
            textureEntry(3),
            textureEntry(4),
            textureEntry(5),
            {
                binding: 6,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "filtering" },
            },
        ],
    });
}
