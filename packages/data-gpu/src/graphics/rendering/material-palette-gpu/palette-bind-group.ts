// © 2026 Adobe. MIT License. See /LICENSE for details.

const layoutByDevice = new WeakMap<GPUDevice, GPUBindGroupLayout>();

/** Bind-group layout for factor PBR: palette storage buffer only (group 1). */
export function createFactorPaletteBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    let layout = layoutByDevice.get(device);
    if (!layout) {
        layout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
            ],
        });
        layoutByDevice.set(device, layout);
    }
    return layout;
}

export function createFactorPaletteBindGroup(device: GPUDevice, palette: GPUBuffer): GPUBindGroup {
    return device.createBindGroup({
        layout: createFactorPaletteBindGroupLayout(device),
        entries: [{ binding: 0, resource: { buffer: palette } }],
    });
}
