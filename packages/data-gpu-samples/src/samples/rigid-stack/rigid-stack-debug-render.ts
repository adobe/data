// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { graphics, physicsData, ColliderShape, SceneUniforms } from "@adobe/data-gpu";
import { rigidStackShader } from "./rigid-stack-render.wgsl.js";

/**
 * The original lightweight debug renderer for rigid-stack — flat Lambertian,
 * bodies tinted by their material's baseColorFactor and brightened by speed,
 * geometry vertex-pulled from packed instance buffers. Kept as a selectable
 * alternative to `pbrRender`: combine `rigidStackDebugRender` instead of
 * `pbrRender` (and drop shapeGeometry/physicsRenderBridge) to use it.
 */
const POSITION_STRIDE = 12;
const CUBE_STRIDE = 24;
const POSE_STRIDE = 32;
const PROPS_STRIDE = 64;
const MAX_INSTANCES = 600;
const BIN = 7;

function unitSphere(rings: number, segments: number): { vertices: Float32Array; indices: Uint16Array } {
    const verts: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
        const theta = (ring / rings) * Math.PI, y = Math.cos(theta), rs = Math.sin(theta);
        for (let seg = 0; seg <= segments; seg++) {
            const phi = (seg / segments) * Math.PI * 2;
            verts.push(rs * Math.cos(phi), y, rs * Math.sin(phi));
        }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring++) for (let seg = 0; seg < segments; seg++) {
        const a = ring * stride + seg, b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

function unitCube(): Float32Array {
    const faces: { n: number[]; v: number[][] }[] = [
        { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
        { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
        { n: [0, 1, 0], v: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
        { n: [0, -1, 0], v: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
        { n: [0, 0, 1], v: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]] },
        { n: [0, 0, -1], v: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
    ];
    const out: number[] = [];
    for (const f of faces) {
        const [a, b, c, d] = f.v;
        for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2]);
    }
    return new Float32Array(out);
}

function groundQuad(half: number, y: number): Float32Array {
    const e = half + 1;
    return new Float32Array([-e, y, -e, e, y, -e, e, y, e, -e, y, -e, e, y, e, -e, y, e]);
}

interface RigidGpu {
    spherePipeline: GPURenderPipeline;
    boxPipeline: GPURenderPipeline;
    groundPipeline: GPURenderPipeline;
    sceneLayout: GPUBindGroupLayout;
    bodyLayout: GPUBindGroupLayout;
    sphereVB: GPUBuffer; sphereIB: GPUBuffer; sphereIndexCount: number;
    cubeVB: GPUBuffer; cubeVertexCount: number;
    groundVB: GPUBuffer; groundVertexCount: number;
    poseBuffer: GPUBuffer;
    propsBuffer: GPUBuffer;
    sceneBG: Map<GPUBuffer, GPUBindGroup>;
    bodyBG: GPUBindGroup;
}

const RENDER_COMPONENTS = ["position", "rotation", "halfExtents", "colliderShape", "linearVelocity", "material"] as const;

export const rigidStackDebugRender = Database.Plugin.create({
    extends: Database.Plugin.combine(graphics, physicsData, SceneUniforms.plugin),
    resources: {
        rigidGpu: { default: null as RigidGpu | null, transient: true },
    },
    systems: {
        rigidRenderInit: {
            schedule: { during: ["postUpdate"] },
            create: db => () => {
                const { device, rigidGpu, canvasFormat, depthFormat } = db.store.resources;
                if (!device || rigidGpu) return;
                const module = device.createShaderModule({ code: rigidStackShader });
                const sceneLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }] });
                const bodyLayout = device.createBindGroupLayout({ entries: [
                    { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                    { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                ] });
                const vbLayout: GPUVertexBufferLayout = { arrayStride: POSITION_STRIDE, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] };
                const cubeVbLayout: GPUVertexBufferLayout = { arrayStride: CUBE_STRIDE, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] };
                const depthStencil: GPUDepthStencilState = { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" };
                const spherePipeline = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, bodyLayout] }), vertex: { module, entryPoint: "vs_sphere", buffers: [vbLayout] }, fragment: { module, entryPoint: "fs_lit", targets: [{ format: canvasFormat }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil });
                const boxPipeline = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, bodyLayout] }), vertex: { module, entryPoint: "vs_box", buffers: [cubeVbLayout] }, fragment: { module, entryPoint: "fs_lit", targets: [{ format: canvasFormat }] }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil });
                const groundPipeline = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] }), vertex: { module, entryPoint: "vs_ground", buffers: [vbLayout] }, fragment: { module, entryPoint: "fs_ground", targets: [{ format: canvasFormat }] }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil });

                const sphere = unitSphere(12, 18);
                const sphereVB = device.createBuffer({ size: sphere.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(sphereVB, 0, sphere.vertices);
                const sphereIB = device.createBuffer({ size: sphere.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(sphereIB, 0, sphere.indices);
                const cube = unitCube();
                const cubeVB = device.createBuffer({ size: cube.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(cubeVB, 0, cube);
                const ground = groundQuad(BIN, 0);
                const groundVB = device.createBuffer({ size: ground.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(groundVB, 0, ground);

                const poseBuffer = device.createBuffer({ size: MAX_INSTANCES * POSE_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const propsBuffer = device.createBuffer({ size: MAX_INSTANCES * PROPS_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const bodyBG = device.createBindGroup({ layout: bodyLayout, entries: [{ binding: 0, resource: { buffer: poseBuffer } }, { binding: 1, resource: { buffer: propsBuffer } }] });

                db.store.resources.rigidGpu = {
                    spherePipeline, boxPipeline, groundPipeline, sceneLayout, bodyLayout,
                    sphereVB, sphereIB, sphereIndexCount: sphere.indices.length,
                    cubeVB, cubeVertexCount: cube.length / 6,
                    groundVB, groundVertexCount: ground.length / 3,
                    poseBuffer, propsBuffer,
                    sceneBG: new Map(),
                    bodyBG,
                };
            },
        },
        rigidRender: {
            schedule: { during: ["render"] },
            create: db => {
                const pose = new Float32Array(MAX_INSTANCES * 8);
                const props = new Float32Array(MAX_INSTANCES * 16);
                let matColor = new Map<number, [number, number, number]>();
                let matCount = -1;
                return () => {
                const gpu = db.store.resources.rigidGpu;
                const { device, renderPassEncoder, _sceneUniformsBuffer } = db.store.resources;
                if (!gpu || !device || !renderPassEncoder || !_sceneUniformsBuffer) return;

                let mc = 0;
                for (const arch of db.store.queryArchetypes(["name", "baseColorFactor"])) mc += arch.rowCount;
                if (mc !== matCount) {
                    matColor = new Map();
                    for (const arch of db.store.queryArchetypes(["name", "baseColorFactor"])) {
                        const id = arch.columns.id, bc = arch.columns.baseColorFactor;
                        for (let r = 0; r < arch.rowCount; r++) {
                            const c = bc.get(r);
                            matColor.set(id.get(r), [c[0], c[1], c[2]]);
                        }
                    }
                    matCount = mc;
                }

                let n = 0;
                for (const arch of db.store.queryArchetypes(RENDER_COMPONENTS)) {
                    const pos = arch.columns.position, ori = arch.columns.rotation, he = arch.columns.halfExtents;
                    const cs = arch.columns.colliderShape, lv = arch.columns.linearVelocity, mt = arch.columns.material;
                    for (let r = 0; r < arch.rowCount && n < MAX_INSTANCES; r++, n++) {
                        const p = pos.get(r), q = ori.get(r), e = he.get(r), v = lv.get(r);
                        const shapeIdx = ColliderShape.toIndex(cs.get(r));
                        const col = matColor.get(mt.get(r)) ?? [0.7, 0.7, 0.7];
                        const bound = shapeIdx === 1 ? Math.hypot(e[0], e[1], e[2]) : e[0];
                        pose[n * 8] = p[0]; pose[n * 8 + 1] = p[1]; pose[n * 8 + 2] = p[2]; pose[n * 8 + 3] = bound;
                        pose[n * 8 + 4] = q[0]; pose[n * 8 + 5] = q[1]; pose[n * 8 + 6] = q[2]; pose[n * 8 + 7] = q[3];
                        props[n * 16] = v[0]; props[n * 16 + 1] = v[1]; props[n * 16 + 2] = v[2];
                        props[n * 16 + 4] = col[0]; props[n * 16 + 5] = col[1]; props[n * 16 + 6] = col[2];
                        props[n * 16 + 12] = e[0]; props[n * 16 + 13] = e[1]; props[n * 16 + 14] = e[2]; props[n * 16 + 15] = shapeIdx;
                    }
                }
                if (n === 0) return;
                device.queue.writeBuffer(gpu.poseBuffer, 0, pose, 0, n * 8);
                device.queue.writeBuffer(gpu.propsBuffer, 0, props, 0, n * 16);

                let sceneBG = gpu.sceneBG.get(_sceneUniformsBuffer);
                if (!sceneBG) {
                    sceneBG = device.createBindGroup({ layout: gpu.sceneLayout, entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }] });
                    gpu.sceneBG.set(_sceneUniformsBuffer, sceneBG);
                }

                renderPassEncoder.setPipeline(gpu.groundPipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setVertexBuffer(0, gpu.groundVB);
                renderPassEncoder.draw(gpu.groundVertexCount);

                renderPassEncoder.setPipeline(gpu.spherePipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setBindGroup(1, gpu.bodyBG);
                renderPassEncoder.setVertexBuffer(0, gpu.sphereVB);
                renderPassEncoder.setIndexBuffer(gpu.sphereIB, "uint16");
                renderPassEncoder.drawIndexed(gpu.sphereIndexCount, n);

                renderPassEncoder.setPipeline(gpu.boxPipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setBindGroup(1, gpu.bodyBG);
                renderPassEncoder.setVertexBuffer(0, gpu.cubeVB);
                renderPassEncoder.draw(gpu.cubeVertexCount, n);
                };
            },
        },
    },
});
