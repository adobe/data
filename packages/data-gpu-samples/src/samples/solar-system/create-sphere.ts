// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Produces unit-radius UV-sphere GPU buffers laid out for StandardVertex
 * (position + normal + tangent + uv). Only used by the solar-system sample
 * to procedurally generate planet geometry.
 */
export function createSphereBuffers(
    device: GPUDevice,
    rings: number,
    segments: number,
): { vertexBuffer: GPUBuffer; indexBuffer: GPUBuffer; indexCount: number; indexFormat: GPUIndexFormat } {
    const verts: number[] = [];
    const idxs: number[] = [];

    for (let r = 0; r <= rings; r++) {
        const phi = (r / rings) * Math.PI;
        const y = Math.cos(phi);
        const sinPhi = Math.sin(phi);
        for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * 2 * Math.PI;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            const x = sinPhi * cosT;
            const z = sinPhi * sinT;
            verts.push(
                x, y, z,
                x, y, z,
                -sinT, 0, cosT, 1,
                s / segments, r / rings,
            );
        }
    }

    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = r * (segments + 1) + s;
            const b = a + 1;
            const c = a + segments + 1;
            const d = c + 1;
            idxs.push(a, c, b, b, c, d);
        }
    }

    const vertexData = new Float32Array(verts);
    const vertexBuffer = device.createBuffer({
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

    const indexData = new Uint16Array(idxs);
    const indexBuffer = device.createBuffer({
        size: indexData.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, indexData);

    return { vertexBuffer, indexBuffer, indexCount: idxs.length, indexFormat: "uint16" };
}
