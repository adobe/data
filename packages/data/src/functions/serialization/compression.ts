// © 2026 Adobe. MIT License. See /LICENSE for details.

import { toArrayBufferBacked } from "../../internal/array-buffer-like/index.js";

const collectStream = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const reader = stream.getReader();

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(toArrayBufferBacked(value));
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
};

const pipeThrough = (data: Uint8Array, transform: TransformStream) => {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        }
    });
    return collectStream(stream.pipeThrough(transform));
};

export const compressDeflate = (data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
    pipeThrough(data, new CompressionStream('deflate'));

export const decompressDeflate = (data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
    pipeThrough(data, new DecompressionStream('deflate'));
