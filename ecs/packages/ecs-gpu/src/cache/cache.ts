// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A cache of what `create` makes for each device and key: a pipeline, a layout, a sampler. Its values for a device go
 * with the device, so a device a world replaced, or one that was lost, holds nothing here. Keys are compared by
 * `keyOf`, by default their JSON.
 */
export const perDevice = <K, V>(create: (device: GPUDevice, key: K) => V, keyOf: (key: K) => string = key => JSON.stringify(key)): ((device: GPUDevice, key: K) => V) => {
    const devices = new WeakMap<GPUDevice, Map<string, { readonly value: V }>>();
    return (device, key) => {
        let made = devices.get(device);
        if (made === undefined) {
            made = new Map();
            devices.set(device, made);
        }
        const name = keyOf(key);
        const found = made.get(name);
        if (found !== undefined) return found.value;
        const value = create(device, key);
        made.set(name, { value });
        return value;
    };
};
