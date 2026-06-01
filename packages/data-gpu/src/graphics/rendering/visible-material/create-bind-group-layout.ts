// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Bind group layout for a visible (PBR-style) material: a uniform buffer
 * with the material factors, five 2D textures (baseColor, metallicRoughness,
 * normal, occlusion, emissive), and a filtering sampler. Stable across
 * renderer pipeline creation and the bind-group builders in `_modelLoader`
 * and `VisibleMaterial.createColorBindGroup`.
 */
export function createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
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
