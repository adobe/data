// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ShapeMesh } from "./shape-mesh.js";

/** Upload a procedural shape mesh into GPU vertex + index buffers (one-time,
 *  when the device is ready). Shared by `shapeGeometry` (sphere/cube) and the
 *  physics bridge (per-dimension capsules). */
export function uploadShapeMesh(device: GPUDevice, mesh: ShapeMesh): { vb: GPUBuffer; ib: GPUBuffer; count: number } {
    const vb = device.createBuffer({ size: mesh.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vb, 0, mesh.vertices);
    const ib = device.createBuffer({ size: mesh.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(ib, 0, mesh.indices);
    return { vb, ib, count: mesh.indices.length };
}
