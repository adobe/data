// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3, type F32 } from "@adobe/data/math";
import { SceneUniforms, graphics, Orbit } from "@adobe/data-gpu";
import { computeShader, renderShader } from "./boids-shaders.js";

// --- Tunables --------------------------------------------------------------

// Cell size must be ≥ the boid view radius so the 3×3×3 cell scan in the
// update pass covers every possible neighbour. We currently use viewR ≈ 2×
// separationDist; at separationDist = 1.0 that's 2.0, hence cellSize = 2.0.
const WORLD_EXTENT = 10;                  // half-extent of cubic toroidal world
const GRID_DIM = 10;                      // 1000 cells, cellSize = 2.0
const CELL_COUNT = GRID_DIM ** 3;
const CELL_SIZE = (WORLD_EXTENT * 2) / GRID_DIM;
// Tuned for visible flocking. With viewR ≈ 1.6 and the 20-unit cube the
// average neighbour count is ~8 — Reynolds' classic boid count band.
const DEFAULT_BOIDS = 4000;

// Per-vertex stride for the boid arrowhead (position + normal, packed).
const MESH_STRIDE = 24;

// 5 × u32 indirect-draw args.
const DRAW_ARGS_SIZE = 20;
// 2 × vec4f per boid.
const BOID_STATE_STRIDE = 32;
// 12 scalar + 2 × vec4f params.
const PARAMS_SIZE = 96;

const SCARE_RADIUS = 3.0;
const SCARE_GAIN = 18.0;

// --- Initial state: clumped positions + curl-noise-like velocity field ----

// Sum-of-sines stand-in for 3D Perlin. Features at ~6-unit scale concentrate
// boids into a handful of blobs rather than a uniform fog, so flocks exist
// from frame 1.
function densityNoise(x: number, y: number, z: number): number {
    const a = Math.sin(x * 0.45 + 0.3) * Math.cos(y * 0.45 + 1.1) * Math.sin(z * 0.45 + 2.4);
    const b = Math.sin(x * 0.95 + 2.7) * Math.cos(y * 0.95 + 0.6) * Math.sin(z * 0.95 + 1.8);
    return a + 0.5 * b;
}

// Smooth, swirly velocity field. Boids in the same blob start moving in the
// same direction so alignment locks them into a coherent flock immediately.
function flowField(x: number, y: number, z: number): [number, number, number] {
    const f = 0.35;
    return [
        Math.sin(y * f + 0.2) * Math.cos(z * f - 0.7) * 3,
        Math.sin(z * f + 1.4) * Math.cos(x * f + 0.3) * 3,
        Math.sin(x * f + 2.1) * Math.cos(y * f + 1.6) * 3,
    ];
}

function buildInitialState(count: number): Float32Array {
    const out = new Float32Array(count * 8);
    const halfRange = WORLD_EXTENT * 0.85;
    for (let i = 0; i < count; i++) {
        // Rejection-sample positions where densityNoise is high.
        let x = 0, y = 0, z = 0;
        let placed = false;
        for (let tries = 0; tries < 32; tries++) {
            x = (Math.random() * 2 - 1) * halfRange;
            y = (Math.random() * 2 - 1) * halfRange;
            z = (Math.random() * 2 - 1) * halfRange;
            if (densityNoise(x, y, z) > -0.1) { placed = true; break; }
        }
        if (!placed) {
            x = (Math.random() * 2 - 1) * halfRange;
            y = (Math.random() * 2 - 1) * halfRange;
            z = (Math.random() * 2 - 1) * halfRange;
        }
        const [vx, vy, vz] = flowField(x, y, z);
        out[i * 8 + 0] = x;
        out[i * 8 + 1] = y;
        out[i * 8 + 2] = z;
        out[i * 8 + 3] = 0;
        out[i * 8 + 4] = vx;
        out[i * 8 + 5] = vy;
        out[i * 8 + 6] = vz;
        out[i * 8 + 7] = 0;
    }
    return out;
}

// --- Mesh: 4-vertex tetrahedral arrowhead, +Z forward ----------------------

function arrowheadMesh(): { vertices: Float32Array; indices: Uint16Array; indexCount: number } {
    // position (3f) + outward normal (3f). Vertex normals taken as normalize(position - centroid).
    const v: number[] = [];
    const push = (x: number, y: number, z: number) => {
        const len = Math.hypot(x, y, z) || 1;
        v.push(x, y, z, x / len, y / len, z / len);
    };
    // 3× the previous scale so each boid is visible against the IBL skybox.
    push(0.00, 0.000, 0.45);  // tip
    push(0.12, -0.075, -0.15);  // back-bot-right
    push(-0.12, -0.075, -0.15);  // back-bot-left
    push(0.00, 0.150, -0.15);  // back-top
    const indices = new Uint16Array([
        0, 1, 3,  // tip-right-top
        0, 3, 2,  // tip-top-left
        0, 2, 1,  // tip-bottom
        1, 2, 3,  // back
    ]);
    return { vertices: new Float32Array(v), indices, indexCount: indices.length };
}

// --- Plugin ----------------------------------------------------------------

interface ComputePipelines {
    clearCells: GPUComputePipeline;
    populateGrid: GPUComputePipeline;
    prefixSum: GPUComputePipeline;
    binBoids: GPUComputePipeline;
    updateBoids: GPUComputePipeline;
}

interface BoidGpu {
    params: GPUBuffer;
    stateA: GPUBuffer;
    stateB: GPUBuffer;
    cellCounts: GPUBuffer;
    cellOffsets: GPUBuffer;
    cellWriteCursors: GPUBuffer;
    sortedIndices: GPUBuffer;
    drawArgs: GPUBuffer;
    meshVB: GPUBuffer;
    meshIB: GPUBuffer;
    indexCount: number;
    /** computeBG[0]: read=A,write=B; computeBG[1]: read=B,write=A. */
    computeBG: [GPUBindGroup, GPUBindGroup];
    /** renderBG[0]: read=B (matches computeBG[0]'s writeState); [1]: read=A. */
    renderBG: [GPUBindGroup, GPUBindGroup];
    pipelines: ComputePipelines;
    renderPipeline: GPURenderPipeline;
}

export const boidsPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(graphics, SceneUniforms.plugin, Orbit.plugin),
    resources: {
        boidsCount: { default: DEFAULT_BOIDS as number, transient: true },
        boidsGpu: { default: null as BoidGpu | null, transient: true },
        boidsPingFrame: { default: 0 as number, transient: true },
        boidsLastTime: { default: 0 as F32, transient: true },
        boidsSceneBG: { default: null as GPUBindGroup | null, transient: true },
        boidsSceneBuffer: { default: null as GPUBuffer | null, transient: true },
        // Cursor scare ray. Origin is the camera eye; dir is the unit vector
        // from the eye through the cursor toward the far plane. Boids near
        // this line are pushed perpendicular to it.
        boidsScareOrigin: { default: [0, 0, 0] as Vec3, transient: true },
        boidsScareDir: { default: [0, 0, 1] as Vec3, transient: true },
        boidsScareActive: { default: 0 as F32, transient: true },
    },
    transactions: {
        setBoidsCount(t, count: number) {
            t.resources.boidsCount = count;
            // Force re-init by clearing the GPU bundle; the init system will rebuild.
            t.resources.boidsGpu = null;
        },
        /** Cast a ray from the camera eye through the cursor toward the far plane.
         *  Any boid near that line — at any depth — will be scared.
         *  `x`/`y` are pixel coords (e.g. from a PointerEvent relative to the canvas).
         *  Internally converts to NDC (x/y ∈ [-1, 1], origin at canvas center, y-up). */
        setScareFromScreen(t, args: { x: number; y: number; width: number; height: number }) {
            const cam = t.resources.camera;
            if (!cam) return;
            const fwd = Vec3.normalize(Vec3.subtract(cam.target, cam.position));
            const right = Vec3.normalize(Vec3.cross(fwd, cam.up));
            const upOrtho = Vec3.cross(right, fwd);
            const tanHalfFov = Math.tan(cam.fieldOfView / 2);
            // NDC conversion: x ∈ [-1,1] left→right, y ∈ [-1,1] bottom→top.
            const ndcX = (args.x / args.width) * 2 - 1;
            const ndcY = 1 - (args.y / args.height) * 2;
            const rx = ndcX * tanHalfFov * cam.aspect;
            const ry = ndcY * tanHalfFov;
            const dir = Vec3.normalize([
                fwd[0] + right[0] * rx + upOrtho[0] * ry,
                fwd[1] + right[1] * rx + upOrtho[1] * ry,
                fwd[2] + right[2] * rx + upOrtho[2] * ry,
            ]);
            t.resources.boidsScareOrigin = [cam.position[0], cam.position[1], cam.position[2]];
            t.resources.boidsScareDir = dir;
            t.resources.boidsScareActive = 1;
        },
        disableScare(t) {
            t.resources.boidsScareActive = 0;
        },
        initializeScene(t) {
            t.resources.orbit = {
                ...t.resources.orbit,
                center:        [0, 0, 0],
                radius:        WORLD_EXTENT * 1.6,
                height:        WORLD_EXTENT * 0.3,
                autoSpinSpeed: 0.08,
                nearFactor:    0.005,
                farFactor:     4,
            };
        },
    },
    systems: {
        boidsInit: {
            create: db => () => {
                const { device, boidsGpu, boidsCount } = db.store.resources;
                if (!device || boidsGpu || boidsCount === 0) return;

                const mesh = arrowheadMesh();

                const meshVB = device.createBuffer({
                    size: mesh.vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(meshVB, 0, mesh.vertices);

                const meshIB = device.createBuffer({
                    size: mesh.indices.byteLength,
                    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(meshIB, 0, mesh.indices);

                const params = device.createBuffer({
                    size: PARAMS_SIZE,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                const stateBytes = boidsCount * BOID_STATE_STRIDE;
                const stateA = device.createBuffer({
                    size: stateBytes,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                const stateB = device.createBuffer({
                    size: stateBytes,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });

                device.queue.writeBuffer(stateA, 0, buildInitialState(boidsCount));

                const cellCounts = device.createBuffer({
                    size: CELL_COUNT * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                const cellOffsets = device.createBuffer({
                    size: CELL_COUNT * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                const cellWriteCursors = device.createBuffer({
                    size: CELL_COUNT * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                const sortedIndices = device.createBuffer({
                    size: boidsCount * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                const drawArgs = device.createBuffer({
                    size: DRAW_ARGS_SIZE,
                    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                device.queue.writeBuffer(drawArgs, 0, new Uint32Array([mesh.indexCount, boidsCount, 0, 0, 0]));

                // Compute layout + pipelines
                const computeLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                    ],
                });
                const computePipelineLayout = device.createPipelineLayout({
                    bindGroupLayouts: [computeLayout],
                });
                const computeModule = device.createShaderModule({ code: computeShader });
                const makeCp = (entry: string): GPUComputePipeline => device.createComputePipeline({
                    layout: computePipelineLayout,
                    compute: { module: computeModule, entryPoint: entry },
                });
                const pipelines: ComputePipelines = {
                    clearCells: makeCp("clear_cells"),
                    populateGrid: makeCp("populate_grid"),
                    prefixSum: makeCp("prefix_sum"),
                    binBoids: makeCp("bin_boids"),
                    updateBoids: makeCp("update_boids"),
                };

                // Two ping-pong compute bind groups.
                const makeComputeBG = (read: GPUBuffer, write: GPUBuffer): GPUBindGroup =>
                    device.createBindGroup({
                        layout: computeLayout,
                        entries: [
                            { binding: 0, resource: { buffer: params } },
                            { binding: 1, resource: { buffer: read } },
                            { binding: 2, resource: { buffer: write } },
                            { binding: 3, resource: { buffer: cellCounts } },
                            { binding: 4, resource: { buffer: cellOffsets } },
                            { binding: 5, resource: { buffer: cellWriteCursors } },
                            { binding: 6, resource: { buffer: sortedIndices } },
                            { binding: 7, resource: { buffer: drawArgs } },
                        ],
                    });
                const computeBG: [GPUBindGroup, GPUBindGroup] = [
                    makeComputeBG(stateA, stateB),
                    makeComputeBG(stateB, stateA),
                ];

                // Render layout + pipeline
                const sceneLayout = device.createBindGroupLayout({
                    entries: [{
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: "uniform" },
                    }],
                });
                const boidStorageLayout = device.createBindGroupLayout({
                    entries: [{
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: "read-only-storage" },
                    }],
                });
                const renderModule = device.createShaderModule({ code: renderShader });
                const renderPipeline = device.createRenderPipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, boidStorageLayout] }),
                    vertex: {
                        module: renderModule,
                        entryPoint: "vs_main",
                        buffers: [{
                            arrayStride: MESH_STRIDE,
                            stepMode: "vertex",
                            attributes: [
                                { format: "float32x3", offset: 0, shaderLocation: 0 },
                                { format: "float32x3", offset: 12, shaderLocation: 1 },
                            ],
                        }],
                    },
                    fragment: {
                        module: renderModule,
                        entryPoint: "fs_main",
                        targets: [{ format: db.store.resources.canvasFormat }],
                    },
                    primitive: { topology: "triangle-list", cullMode: "none" },
                    depthStencil: {
                        format: db.store.resources.depthFormat,
                        depthWriteEnabled: true,
                        depthCompare: "less",
                    },
                });
                const renderBG: [GPUBindGroup, GPUBindGroup] = [
                    device.createBindGroup({
                        layout: boidStorageLayout,
                        entries: [{ binding: 0, resource: { buffer: stateB } }],
                    }),
                    device.createBindGroup({
                        layout: boidStorageLayout,
                        entries: [{ binding: 0, resource: { buffer: stateA } }],
                    }),
                ];

                db.store.resources.boidsGpu = {
                    params, stateA, stateB,
                    cellCounts, cellOffsets, cellWriteCursors,
                    sortedIndices, drawArgs,
                    meshVB, meshIB, indexCount: mesh.indexCount,
                    computeBG, renderBG, pipelines, renderPipeline,
                };
            },
            schedule: { during: ["postUpdate"] },
        },
        boidsCompute: {
            create: db => () => {
                const gpu = db.store.resources.boidsGpu;
                const { device, commandEncoder, boidsCount } = db.store.resources;
                if (!gpu || !device || !commandEncoder) return;

                const now = performance.now();
                const last = db.store.resources.boidsLastTime || now;
                const dt = Math.min((now - last) / 1000, 0.05);
                db.store.resources.boidsLastTime = now;

                // Refresh params each frame.
                const params = new ArrayBuffer(PARAMS_SIZE);
                const f32 = new Float32Array(params);
                const u32 = new Uint32Array(params);
                f32[0] = dt;                // dt
                f32[1] = CELL_SIZE;         // cellSize
                f32[2] = WORLD_EXTENT;      // worldExtent
                u32[3] = boidsCount;        // boidsCount
                u32[4] = GRID_DIM;          // gridDim
                u32[5] = CELL_COUNT;        // cellCount
                u32[6] = gpu.indexCount;    // indexCount
                f32[7] = 0.8;               // separationDist → viewR ≈ 1.6
                f32[8] = 3.0;               // separationGain (strong push-apart)
                f32[9] = 2.0;               // alignmentGain (strong velocity matching)
                f32[10] = 0.6;               // cohesionGain (looser pull-in)
                f32[11] = 9.0;               // maxSpeed
                // scareOrigin (vec4 at offset 48): xyz = eye pos, w = active flag.
                const scareOrigin = db.store.resources.boidsScareOrigin;
                f32[12] = scareOrigin[0];
                f32[13] = scareOrigin[1];
                f32[14] = scareOrigin[2];
                f32[15] = db.store.resources.boidsScareActive;
                // scareDir (vec4 at offset 64): xyz = unit eye→cursor direction.
                const scareDir = db.store.resources.boidsScareDir;
                f32[16] = scareDir[0];
                f32[17] = scareDir[1];
                f32[18] = scareDir[2];
                // scareTuning (vec4 at offset 80): x = radius, y = gain.
                f32[20] = SCARE_RADIUS;
                f32[21] = SCARE_GAIN;
                device.queue.writeBuffer(gpu.params, 0, params);

                const ping = db.store.resources.boidsPingFrame & 1;
                const bg = gpu.computeBG[ping];

                const pass = commandEncoder.beginComputePass();
                pass.setBindGroup(0, bg);

                const cellWG = Math.ceil(CELL_COUNT / 64);
                const boidWG = Math.ceil(boidsCount / 64);

                pass.setPipeline(gpu.pipelines.clearCells);
                pass.dispatchWorkgroups(cellWG);
                pass.setPipeline(gpu.pipelines.populateGrid);
                pass.dispatchWorkgroups(boidWG);
                pass.setPipeline(gpu.pipelines.prefixSum);
                pass.dispatchWorkgroups(1);
                pass.setPipeline(gpu.pipelines.binBoids);
                pass.dispatchWorkgroups(boidWG);
                pass.setPipeline(gpu.pipelines.updateBoids);
                pass.dispatchWorkgroups(boidWG);
                pass.end();

                db.store.resources.boidsPingFrame = ping + 1;
            },
            schedule: { during: ["physics"], after: ["boidsInit"] },
        },
        boidsRender: {
            create: db => () => {
                const gpu = db.store.resources.boidsGpu;
                const { renderPassEncoder, device, _sceneUniformsBuffer, boidsSceneBuffer, boidsSceneBG } = db.store.resources;
                if (!gpu || !renderPassEncoder || !device || !_sceneUniformsBuffer) return;

                let sceneBG = boidsSceneBG;
                if (boidsSceneBuffer !== _sceneUniformsBuffer || !sceneBG) {
                    sceneBG = device.createBindGroup({
                        layout: gpu.renderPipeline.getBindGroupLayout(0),
                        entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }],
                    });
                    db.store.resources.boidsSceneBG = sceneBG;
                    db.store.resources.boidsSceneBuffer = _sceneUniformsBuffer;
                }

                // The render bind group matches whichever buffer compute just wrote.
                const written = (db.store.resources.boidsPingFrame - 1) & 1;
                renderPassEncoder.setPipeline(gpu.renderPipeline);
                renderPassEncoder.setBindGroup(0, sceneBG);
                renderPassEncoder.setBindGroup(1, gpu.renderBG[written]);
                renderPassEncoder.setVertexBuffer(0, gpu.meshVB);
                renderPassEncoder.setIndexBuffer(gpu.meshIB, "uint16");
                renderPassEncoder.drawIndexedIndirect(gpu.drawArgs, 0);
            },
            schedule: { during: ["render"] },
        },
    },
});

export type BoidsService = Database.Plugin.ToDatabase<typeof boidsPlugin>;
