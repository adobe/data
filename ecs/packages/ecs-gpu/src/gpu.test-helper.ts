// © 2026 Adobe. MIT License. See /LICENSE for details.
import { inject } from "vitest";

declare module "vitest" {
    interface ProvidedContext {
        /** Whether this run has a GPU: tests that need one skip without it, as on CI's runners (`vitest.config.ts`). */
        readonly gpu: boolean;
    }
}

/** Whether this run has a GPU, for `it.runIf(gpu)`. */
export const gpu = inject("gpu");

/** A device of its own for a test. */
export const testDevice = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

/** The first pixel of a texture of 4-byte texels, as its bytes. */
export const firstPixel = async (device: GPUDevice, texture: GPUTexture): Promise<readonly number[]> => {
    const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = [...new Uint8Array(buffer.getMappedRange(0, 4))];
    buffer.destroy();
    return bytes;
};

/** Whether a texture or buffer was destroyed: using it in a submit is then a validation error. */
export const destroyed = async (device: GPUDevice, texture: GPUTexture): Promise<boolean> => {
    device.pushErrorScope("validation");
    const buffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    const error = await device.popErrorScope();
    buffer.destroy();
    return error !== null;
};

/** What a canvas shows, once: a function giving the pixel at `x`, `y` as RGBA bytes. */
export const canvasPixels = (canvas: OffscreenCanvas): ((x: number, y: number) => readonly number[]) => {
    const bitmap = canvas.transferToImageBitmap();
    const copy = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = copy.getContext("2d");
    if (context === null) throw new Error("No 2D context.");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return (x, y) => [...data.subarray((y * bitmap.width + x) * 4, (y * bitmap.width + x) * 4 + 4)];
};

/** Records painting `rows` rows of a texture of 4-byte texels from row `from` in `bytes`, its texels' bytes. */
export const paintRows = (device: GPUDevice, encoder: GPUCommandEncoder, texture: GPUTexture, from: number, rows: number, bytes: readonly number[]): void => {
    const buffer = device.createBuffer({ size: 256 * rows, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
    const texels = new Uint8Array(buffer.getMappedRange());
    for (let row = 0; row < rows; row++) for (let x = 0; x < texture.width; x++) texels.set(bytes, row * 256 + x * 4);
    buffer.unmap();
    encoder.copyBufferToTexture({ buffer, bytesPerRow: 256 }, { texture, origin: [0, from] }, [texture.width, rows]);
};

/** The bytes of an RGBA color of 0 to 255 in a texture of `format`, whose channels may be stored blue first. */
export const bytesIn = (format: GPUTextureFormat, [r, g, b, a]: readonly [number, number, number, number]): readonly number[] =>
    format.startsWith("bgra") ? [b, g, r, a] : [r, g, b, a];
