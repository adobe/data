// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, System, type World } from "@adobe/ecs";

/** What a device is requested with: the adapter's options, and the features and limits the device needs. */
export type Options = GPURequestAdapterOptions & {
    readonly requiredFeatures?: readonly GPUFeatureName[];
    readonly requiredLimits?: Readonly<Record<string, number>>;
};

/**
 * A device on this thread, or null where there's no WebGPU, no adapter for `options`, or the adapter refused the
 * device. Call it on the thread the world runs on: a device can't move between threads.
 */
export const request = async (options: Options = {}): Promise<GPUDevice | null> => {
    const { requiredFeatures, requiredLimits, ...adapterOptions } = options;
    const adapter = await globalThis.navigator?.gpu?.requestAdapter(adapterOptions);
    if (adapter === null || adapter === undefined) return null;
    try {
        return await adapter.requestDevice({ requiredFeatures, requiredLimits });
    } catch {
        return null;
    }
};

/** Sets the world's `gpuDevice`. */
export const set = System.create({}, ({ resources }, input: { readonly device: GPUDevice | null }) => {
    resources[gpuDevice] = input.device;
});

/**
 * Keeps the world supplied with a device: requests one now, and another each time the one it gave is lost. Resolves
 * once the first request settled, to whether it gave the world a device, and a function that stops keeping it. Call it
 * on the world's thread.
 */
export const keep = async (world: Pick<World, "run">, options: Options = {}): Promise<{ readonly supplied: boolean; readonly stop: () => void }> => {
    let stopped = false;
    const supply = async (): Promise<boolean> => {
        const device = await request(options);
        if (device === null || stopped) return false;
        await world.run(set, { device });
        void device.lost.then(() => { if (!stopped) void supply(); });
        return true;
    };
    const supplied = await supply();
    return { supplied, stop: () => { stopped = true; } };
};
