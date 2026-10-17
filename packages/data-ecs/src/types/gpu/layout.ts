/**
 * Bytes per parameter or table record, the dynamic offset alignment WebGPU guarantees. A record is `u32` words: a
 * row count, then a word address in the heap per column, then, for kernels, scalars as f32 bits.
 */
export const recordBytes = 256;

const layouts = new WeakMap<GPUDevice, GPUBindGroupLayout>();

/**
 * The bind group layout of `wgsl` declarations, which render pipelines take at the group they name. It's the same
 * object for a device every time, so pipelines can be built before a world exists.
 */
export const layout = (device: GPUDevice): GPUBindGroupLayout => {
    let existing = layouts.get(device);
    if (existing === undefined) {
        const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
        existing = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility, buffer: { type: "read-only-storage" } },
                { binding: 1, visibility, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: recordBytes } },
            ],
        });
        layouts.set(device, existing);
    }
    return existing;
};
