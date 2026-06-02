// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { graphics, physics, SceneUniforms, Orbit } from "@adobe/data-gpu";
import { physicsDropShader } from "./physics-drop-render.wgsl.js";

const POSITION_STRIDE = 12; // vec3f.

/** Unit UV-sphere, positions only (normal = normalize(position) in the shader). */
function unitSphere(rings: number, segments: number): { vertices: Float32Array; indices: Uint16Array } {
    const verts: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
        const theta = (ring / rings) * Math.PI;
        const y = Math.cos(theta);
        const rs = Math.sin(theta);
        for (let seg = 0; seg <= segments; seg++) {
            const phi = (seg / segments) * Math.PI * 2;
            verts.push(rs * Math.cos(phi), y, rs * Math.sin(phi));
        }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring++) {
        for (let seg = 0; seg < segments; seg++) {
            const a = ring * stride + seg;
            const b = a + stride;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

const CUBE_STRIDE = 24; // vec3f position + vec3f normal.

/** Unit cube in [-1,1]³, interleaved position+face-normal, 36 vertices. */
function unitCube(): Float32Array {
    const faces: { n: number[]; v: number[][] }[] = [
        { n: [ 1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
        { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
        { n: [0,  1, 0], v: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
        { n: [0, -1, 0], v: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
        { n: [0, 0,  1], v: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]] },
        { n: [0, 0, -1], v: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
    ];
    const out: number[] = [];
    for (const f of faces) {
        const [a, b, c, d] = f.v;
        for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2]);
    }
    return new Float32Array(out);
}

/** Flat quad at the floor spanning the bin (+margin), two triangles. */
function groundQuad(half: number, y: number): Float32Array {
    const e = half + 1;
    return new Float32Array([
        -e, y, -e,   e, y, -e,   e, y, e,
        -e, y, -e,   e, y,  e,  -e, y, e,
    ]);
}

interface DropGpu {
    spherePipeline: GPURenderPipeline;
    boxPipeline: GPURenderPipeline;
    groundPipeline: GPURenderPipeline;
    particlePipeline: GPURenderPipeline;
    sceneLayout: GPUBindGroupLayout;
    bodyLayout: GPUBindGroupLayout;
    particleLayout: GPUBindGroupLayout;
    sphereVB: GPUBuffer;
    sphereIB: GPUBuffer;
    sphereIndexCount: number;
    cubeVB: GPUBuffer;
    cubeVertexCount: number;
    groundVB: GPUBuffer;
    groundVertexCount: number;
    /** Bind groups cached per (stable) buffer identity. Map mutation avoids
     *  reassigning fields on the read-only resource bundle. */
    sceneBG: Map<GPUBuffer, GPUBindGroup>;
    bodyBG: Map<GPUBuffer, GPUBindGroup>;
    particleBG: Map<GPUBuffer, GPUBindGroup>;
}

export const physicsDropPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(graphics, physics, SceneUniforms.plugin, Orbit.plugin),
    resources: {
        dropGpu: { default: null as DropGpu | null, transient: true },
    },
    transactions: {
        initializeScene(t) {
            // Moderate count during the solver rework; pushed higher once the
            // compliant-XPBD + velocity-restitution solver lands.
            t.resources.physicsConfig = { ...t.resources.physicsConfig, halfExtent: 11 };
            t.resources.physicsBodyCount = 400;
            const cfg = t.resources.physicsConfig;
            t.resources.orbit = {
                ...t.resources.orbit,
                center: [0, 3, 0],
                radius: cfg.halfExtent * 3.2,
                height: cfg.halfExtent * 1.4,
                autoSpinSpeed: 0.15,
            };
            t.resources.light = {
                ...t.resources.light,
                direction: [-2, -5, -3],
                color: [1.0, 0.98, 0.92],
                ambientStrength: 0.35,
            };
        },
    },
    systems: {
        // Demonstrates the flag-gated collision event path: log each batch of
        // events drained from the GPU, once per epoch (so resting contacts that
        // re-report every readback aren't spammed every frame).
        logCollisions: {
            schedule: { during: ["postUpdate"] },
            create: db => {
                let lastEpoch = 0;
                return () => {
                    const { physicsEventEpoch, physicsCollisionEvents } = db.store.resources;
                    if (physicsEventEpoch === lastEpoch) return;
                    lastEpoch = physicsEventEpoch;
                    for (const e of physicsCollisionEvents) {
                        console.log(`[collision] flagged body ${e.bodyA} hit body ${e.bodyB} (penetration ${e.penetration.toFixed(3)})`);
                    }
                };
            },
        },
        dropRenderInit: {
            schedule: { during: ["postUpdate"], after: ["physicsInit"] },
            create: db => () => {
                const { device, dropGpu, canvasFormat, depthFormat, physicsConfig } = db.store.resources;
                if (!device || dropGpu) return;

                const module = device.createShaderModule({ code: physicsDropShader });
                const sceneLayout = device.createBindGroupLayout({
                    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
                });
                const bodyLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                    ],
                });
                const vbLayout: GPUVertexBufferLayout = {
                    arrayStride: POSITION_STRIDE,
                    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
                };
                const depthStencil: GPUDepthStencilState = { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" };

                const spherePipeline = device.createRenderPipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, bodyLayout] }),
                    vertex: { module, entryPoint: "vs_sphere", buffers: [vbLayout] },
                    fragment: { module, entryPoint: "fs_lit", targets: [{ format: canvasFormat }] },
                    primitive: { topology: "triangle-list", cullMode: "back" },
                    depthStencil,
                });
                const cubeVbLayout: GPUVertexBufferLayout = {
                    arrayStride: CUBE_STRIDE,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 12, format: "float32x3" },
                    ],
                };
                const boxPipeline = device.createRenderPipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, bodyLayout] }),
                    vertex: { module, entryPoint: "vs_box", buffers: [cubeVbLayout] },
                    fragment: { module, entryPoint: "fs_lit", targets: [{ format: canvasFormat }] },
                    primitive: { topology: "triangle-list", cullMode: "none" },
                    depthStencil,
                });
                const groundPipeline = device.createRenderPipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] }),
                    vertex: { module, entryPoint: "vs_ground", buffers: [vbLayout] },
                    fragment: { module, entryPoint: "fs_ground", targets: [{ format: canvasFormat }] },
                    primitive: { topology: "triangle-list", cullMode: "none" },
                    depthStencil,
                });
                const particleLayout = device.createBindGroupLayout({
                    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }],
                });
                const particlePipeline = device.createRenderPipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, particleLayout] }),
                    vertex: { module, entryPoint: "vs_particle", buffers: [vbLayout] },
                    fragment: { module, entryPoint: "fs_particle", targets: [{ format: canvasFormat }] },
                    primitive: { topology: "triangle-list", cullMode: "back" },
                    depthStencil,
                });

                const sphere = unitSphere(12, 18);
                const sphereVB = device.createBuffer({ size: sphere.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(sphereVB, 0, sphere.vertices);
                const sphereIB = device.createBuffer({ size: sphere.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(sphereIB, 0, sphere.indices);

                const cube = unitCube();
                const cubeVB = device.createBuffer({ size: cube.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(cubeVB, 0, cube);

                const ground = groundQuad(physicsConfig.halfExtent, physicsConfig.floorY);
                const groundVB = device.createBuffer({ size: ground.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(groundVB, 0, ground);

                db.store.resources.dropGpu = {
                    spherePipeline, boxPipeline, groundPipeline, particlePipeline,
                    sceneLayout, bodyLayout, particleLayout,
                    sphereVB, sphereIB, sphereIndexCount: sphere.indices.length,
                    cubeVB, cubeVertexCount: cube.length / 6,
                    groundVB, groundVertexCount: ground.length / 3,
                    sceneBG: new Map(),
                    bodyBG: new Map(),
                    particleBG: new Map(),
                };
            },
        },
        dropRender: {
            schedule: { during: ["render"] },
            create: db => () => {
                const gpu = db.store.resources.dropGpu;
                const { device, renderPassEncoder, _sceneUniformsBuffer, physicsPositionBuffer, physicsVelocityBuffer, physicsRenderCount, physicsParticleBuffer, physicsParticleCount } = db.store.resources;
                if (!gpu || !device || !renderPassEncoder || !_sceneUniformsBuffer || !physicsPositionBuffer || !physicsVelocityBuffer) return;

                // Scene bind group, cached by the (stable) scene uniform buffer.
                let sceneBG = gpu.sceneBG.get(_sceneUniformsBuffer);
                if (!sceneBG) {
                    sceneBG = device.createBindGroup({
                        layout: gpu.sceneLayout,
                        entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }],
                    });
                    gpu.sceneBG.set(_sceneUniformsBuffer, sceneBG);
                }
                // Body bind group, cached per ping-pong position buffer (velocity is stable).
                let bodyBG = gpu.bodyBG.get(physicsPositionBuffer);
                if (!bodyBG) {
                    bodyBG = device.createBindGroup({
                        layout: gpu.bodyLayout,
                        entries: [
                            { binding: 0, resource: { buffer: physicsPositionBuffer } },
                            { binding: 1, resource: { buffer: physicsVelocityBuffer } },
                        ],
                    });
                    gpu.bodyBG.set(physicsPositionBuffer, bodyBG);
                }

                // Ground.
                renderPassEncoder.setPipeline(gpu.groundPipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setVertexBuffer(0, gpu.groundVB);
                renderPassEncoder.draw(gpu.groundVertexCount);

                // Spheres (instanced).
                renderPassEncoder.setPipeline(gpu.spherePipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setBindGroup(1, bodyBG);
                renderPassEncoder.setVertexBuffer(0, gpu.sphereVB);
                renderPassEncoder.setIndexBuffer(gpu.sphereIB, "uint16");
                renderPassEncoder.drawIndexed(gpu.sphereIndexCount, physicsRenderCount);

                // Boxes (instanced cube, oriented + scaled per instance; the same
                // body bind group, vs_box degenerates non-box instances).
                renderPassEncoder.setPipeline(gpu.boxPipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setBindGroup(1, bodyBG);
                renderPassEncoder.setVertexBuffer(0, gpu.cubeVB);
                renderPassEncoder.draw(gpu.cubeVertexCount, physicsRenderCount);

                // Particles (instanced, same sphere mesh, vertex-pulled center+size).
                if (physicsParticleBuffer && physicsParticleCount > 0) {
                    let particleBG = gpu.particleBG.get(physicsParticleBuffer);
                    if (!particleBG) {
                        particleBG = device.createBindGroup({
                            layout: gpu.particleLayout,
                            entries: [{ binding: 0, resource: { buffer: physicsParticleBuffer } }],
                        });
                        gpu.particleBG.set(physicsParticleBuffer, particleBG);
                    }
                    renderPassEncoder.setPipeline(gpu.particlePipeline);
                    renderPassEncoder.setBindGroup(0, sceneBG);
                    renderPassEncoder.setBindGroup(1, particleBG);
                    renderPassEncoder.setVertexBuffer(0, gpu.sphereVB);
                    renderPassEncoder.setIndexBuffer(gpu.sphereIB, "uint16");
                    renderPassEncoder.drawIndexed(gpu.sphereIndexCount, physicsParticleCount);
                }
            },
        },
    },
});

export type PhysicsDropService = Database.Plugin.ToDatabase<typeof physicsDropPlugin>;
