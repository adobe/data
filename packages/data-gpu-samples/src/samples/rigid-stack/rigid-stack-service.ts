// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat } from "@adobe/data/math";
import { graphics, physicsData, cpuXpbd, ColliderShape, Material, SceneUniforms, Orbit } from "@adobe/data-gpu";
import { rigidStackShader } from "./rigid-stack-render.wgsl.js";

const POSITION_STRIDE = 12;
const CUBE_STRIDE = 24;
const POSE_STRIDE = 32;   // 2 vec4 / instance: pos+boundingR, quat
const PROPS_STRIDE = 64;  // 4 vec4 / instance: vel, _, _, halfExtent+shape
const MAX_INSTANCES = 600;

// Scene config.
const BIN = 7;                 // half-extent of the floor / containing walls
const STACK_W = 4, STACK_D = 4, STACK_H = 4;   // dynamic block stack (unit cubes)
const SPAWN_INTERVAL = 0.18;   // seconds between dynamic drops
const SPAWN_DELAY = 2.5;       // let the bare stack settle first, to verify it holds
const DYNAMIC_CAP = 200;       // stop spawning at this many dropped bodies
const SPAWN_SPREAD = 2.5;      // ± x/z spawn area (roughly over the stack)
const SPAWN_HEIGHT = 14;

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

const RENDER_COMPONENTS = ["position", "orientation", "halfExtents", "colliderShape", "linearVelocity", "material"] as const;

export const rigidStackPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(graphics, physicsData, cpuXpbd, SceneUniforms.plugin, Orbit.plugin),
    resources: {
        rigidGpu: { default: null as RigidGpu | null, transient: true },
        _spawnAccum: { default: 0 as number, transient: true },
        _spawnElapsed: { default: 0 as number, transient: true },
        _spawnedDynamic: { default: 0 as number, transient: true },
        _spawnLastTime: { default: 0 as number, transient: true },
    },
    transactions: {
        initializeScene(t) {
            t.resources.cpuPhysicsConfig = {
                ...t.resources.cpuPhysicsConfig,
                gravity: 18, floorY: 0, binExtent: BIN,
                substeps: 10, iterations: 1,  // Small-Steps: narrowphase once per substep
                restitutionThreshold: 1.5, sleepLinear: 0.2, sleepAngular: 0.2,
                worldRestitution: 0.2, worldFriction: 0.6,
            };
            t.resources.orbit = {
                ...t.resources.orbit,
                center: [0, 3, 0], radius: 26, height: 12, autoSpinSpeed: 0.12,
            };
            t.resources.light = {
                ...t.resources.light,
                direction: [-2, -5, -3], color: [1.0, 0.98, 0.92], ambientStrength: 0.4,
            };
            // Dynamic block stack: a grid of unit cubes resting on the static
            // floor. Dynamic so we can verify the solver holds the stack, and so
            // dropped bodies knock it around. A hair of vertical gap avoids
            // initial face-coincidence ambiguity; they settle into contact.
            const x0 = -(STACK_W - 1) / 2, z0 = -(STACK_D - 1) / 2;
            for (let y = 0; y < STACK_H; y++) {
                for (let x = 0; x < STACK_W; x++) {
                    for (let z = 0; z < STACK_D; z++) {
                        t.archetypes.RigidBody.insert({
                            bodyType: "dynamic",
                            colliderShape: "box",
                            halfExtents: [0.5, 0.5, 0.5],
                            material: "wood",
                            position: [x0 + x, 0.55 + y * 1.02, z0 + z],
                            orientation: Quat.identity,
                            linearVelocity: [0, 0, 0],
                            angularVelocity: [0, 0, 0],
                        });
                    }
                }
            }
        },
        spawnBody(t) {
            const isBox = Math.random() < 0.4;
            const mats = Material.list;
            const mat = mats[Math.floor(Math.random() * mats.length)];
            const he: [number, number, number] = isBox
                ? [0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.3]
                : [0.3 + Math.random() * 0.4, 0, 0];
            t.archetypes.RigidBody.insert({
                bodyType: "dynamic",
                colliderShape: isBox ? "box" : "sphere",
                halfExtents: he,
                material: mat,
                position: [(Math.random() * 2 - 1) * SPAWN_SPREAD, SPAWN_HEIGHT, (Math.random() * 2 - 1) * SPAWN_SPREAD],
                orientation: isBox ? randomQuat() : Quat.identity,
                // an initial downward toss so each body clears the spawn point
                // before the next appears (no overlapping pile at the top).
                linearVelocity: [0, -6, 0],
                angularVelocity: [0, 0, 0],
            });
        },
    },
    systems: {
        // Drop a dynamic body every SPAWN_INTERVAL until the cap.
        spawner: {
            schedule: { during: ["update"] },
            create: db => () => {
                if (db.store.resources._spawnedDynamic >= DYNAMIC_CAP) return;
                const now = performance.now();
                const last = db.store.resources._spawnLastTime || now;
                const dt = Math.min((now - last) / 1000, 0.05);
                db.store.resources._spawnLastTime = now;
                const elapsed = db.store.resources._spawnElapsed + dt;
                db.store.resources._spawnElapsed = elapsed;
                if (elapsed < SPAWN_DELAY) return;  // let the bare stack settle + prove stable first
                let accum = db.store.resources._spawnAccum + dt;
                while (accum >= SPAWN_INTERVAL && db.store.resources._spawnedDynamic < DYNAMIC_CAP) {
                    accum -= SPAWN_INTERVAL;
                    db.transactions.spawnBody();
                    db.store.resources._spawnedDynamic = db.store.resources._spawnedDynamic + 1;
                }
                db.store.resources._spawnAccum = accum;
            },
        },
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
            // pack arrays in a closure (resources are deep-readonly)
            create: db => {
                const pose = new Float32Array(MAX_INSTANCES * 8);
                const props = new Float32Array(MAX_INSTANCES * 16);
                return () => {
                const gpu = db.store.resources.rigidGpu;
                const { device, renderPassEncoder, _sceneUniformsBuffer } = db.store.resources;
                if (!gpu || !device || !renderPassEncoder || !_sceneUniformsBuffer) return;

                // pack ECS rigid-body columns → instance buffers
                let n = 0;
                for (const arch of db.store.queryArchetypes(RENDER_COMPONENTS)) {
                    const pos = arch.columns.position, ori = arch.columns.orientation, he = arch.columns.halfExtents;
                    const cs = arch.columns.colliderShape, lv = arch.columns.linearVelocity, mt = arch.columns.material;
                    for (let r = 0; r < arch.rowCount && n < MAX_INSTANCES; r++, n++) {
                        const p = pos.get(r), q = ori.get(r), e = he.get(r), v = lv.get(r);
                        const shapeIdx = ColliderShape.toIndex(cs.get(r));
                        const col = Material.materialColor[mt.get(r)];
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

function randomQuat(): [number, number, number, number] {
    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)];
}
