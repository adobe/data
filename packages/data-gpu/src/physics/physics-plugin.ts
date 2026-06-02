// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import { physicsComputeShader } from "./physics-compute.wgsl.js";
import { particleComputeShader } from "./particle-compute.wgsl.js";
import { broadphaseComputeShader } from "./broadphase-compute.wgsl.js";
import { Material } from "./material/material.js";
import type { CollisionEvent } from "./collision-event.js";

/**
 * GPU rigid-body XPBD physics — Phase D.
 *
 * GPU-authoritative: body state (pose, velocity, orientation, inertia) lives in
 * storage buffers, simulated entirely on the GPU and exposed via
 * `physicsPositionBuffer` (pose) / `physicsVelocityBuffer` (props) /
 * `physicsRenderCount` for a renderer to vertex-pull. Depends only on `core`.
 *
 * Per frame: integrate (predict pose) → report (flag-gated collision events) → K
 * Jacobi solve iterations (sphere-sphere, sphere-box, box-box contacts + static
 * world) → finalize (linear + angular velocity from pose delta). Spheres and
 * oriented cuboids of varied size fall, tumble, collide, and stack. Body-body
 * neighbour search is brute-force O(N²) — a placeholder for the LBVH broadphase.
 *
 * Collision events: bodies flagged `REPORT_BODY_HITS` append to a GPU
 * append-buffer (atomic counter + records). The buffer is copied to a mappable
 * staging buffer and drained on the CPU into `physicsCollisionEvents`, with
 * `physicsEventEpoch` bumped per batch so a consumer can log only new events.
 * Readback is double-buffered via a small state machine — never stalls the
 * frame. Cost is proportional to the number of flagged bodies.
 */

const PARAMS_SIZE = 32;   // 8 × 4 bytes — see Params struct in the shader.
const POSE_STRIDE = 32;   // 2 × vec4f — [pos.xyz + boundingRadius, quat]
const PROPS_STRIDE = 64;  // 4 × vec4f — vel+invMass, angVel, invInertia, halfExtent+shape
const WORKGROUP = 64;
// Small-Steps XPBD: many small substeps with few iterations each is more stable
// (and cheaper) than one big step with many iterations — small dt keeps
// penetrations shallow, so position corrections (and the velocities rebuilt from
// them) stay small instead of launching bodies.
const SUBSTEPS = 8;
const SOLVE_ITERS_PER_SUBSTEP = 2;

const SHAPE_SPHERE = 0;
const SHAPE_BOX = 1;
const BOX_FRACTION = 0.4;  // share of bodies that are cuboids

const FLAG_REPORT_BODY_HITS = 1;
const REPORT_THRESHOLD = 0.08;   // min penetration (world units) that emits an event
const FLAGGED_BODY_COUNT = 4;    // how many bodies report their hits, for the demo
const MAX_EVENTS = 256;
const EVENT_HEADER = 16;         // atomic counter + 12 bytes padding
const EVENT_RECORD = 16;         // a, b, penetration, pad
const EVENTS_SIZE = EVENT_HEADER + MAX_EVENTS * EVENT_RECORD;

// Staging readback state machine.
const STAGING_FREE = 0;     // ready to receive a copy
const STAGING_COPIED = 1;   // copy recorded this frame, awaiting map
const STAGING_MAPPED = 2;   // mapAsync in flight, awaiting callback

// Query-only particles.
const PARTICLE_CAPACITY = 2000;
const PARTICLE_STRIDE = 48;       // 3 × vec4f — see particle-compute.wgsl.
const PARTICLE_PARAMS_SIZE = 32;  // 8 × 4 bytes — see PParams.
const PARTICLE_RESTITUTION = 0.5;

// LBVH broadphase.
const BVH_PARAMS_SIZE = 16;       // count, npad, margin, pad — see BParams.
const BVH_NODE_STRIDE = 32;       // 2 × vec4f / node.
const SORT_SLOT = 256;            // minUniformBufferOffsetAlignment for dynamic offsets.
const BVH_MARGIN = 0.6;           // leaf-AABB inflation: covers intra-frame solver
                                  // displacement so candidates stay valid across the
                                  // K solve iterations (the tree is built once, on the
                                  // predicted poses, and not rebuilt per iteration).

const nextPow2 = (n: number): number => { let p = 1; while (p < n) p <<= 1; return p; };

/** Bitonic compare-exchange schedule: (j, k) for every pass, outer k then inner j. */
function bitonicPasses(npad: number): { j: number; k: number }[] {
    const passes: { j: number; k: number }[] = [];
    for (let k = 2; k <= npad; k <<= 1) {
        for (let j = k >> 1; j > 0; j >>= 1) passes.push({ j, k });
    }
    return passes;
}

interface PhysicsConfig {
    gravity: number;
    damping: number;
    floorY: number;
    halfExtent: number;
}

interface PhysicsGpu {
    params: GPUBuffer;
    pose: [GPUBuffer, GPUBuffer];  // ping-pong, [pos.xyz + boundingRadius, quat]
    prev: GPUBuffer;               // [prevPos.xyz, prevQuat]
    props: GPUBuffer;              // vel+invMass, angVel, invInertia, halfExtent+shape
    flags: GPUBuffer;              // u32 per body
    events: GPUBuffer;             // atomic counter + records (storage, COPY_SRC)
    staging: GPUBuffer;            // mappable copy of `events` (MAP_READ, COPY_DST)
    integratePipeline: GPUComputePipeline;
    reportPipeline: GPUComputePipeline;
    solvePipeline: GPUComputePipeline;
    finalizePipeline: GPUComputePipeline;
    /** bg[r]: poseIn = pose[r], poseOut = pose[1-r]. */
    bindGroup: [GPUBindGroup, GPUBindGroup];
    count: number;
    // Query-only particles.
    particleParams: GPUBuffer;
    particles: GPUBuffer;
    particlePipeline: GPUComputePipeline;
    /** particleBindGroup[r] reads the bodies in pose[r] (final positions). */
    particleBindGroup: [GPUBindGroup, GPUBindGroup];
    // LBVH broadphase, built each frame on the predicted poses.
    bvhFlags: GPUBuffer;
    bvhFlagsZero: Uint32Array;
    sceneBoundsPipeline: GPUComputePipeline;
    mortonPipeline: GPUComputePipeline;
    bitonicPipeline: GPUComputePipeline;
    buildPipeline: GPUComputePipeline;
    leafBoundsPipeline: GPUComputePipeline;
    refitPipeline: GPUComputePipeline;
    /** buildBindGroup[r] reads predicted poses from pose[r]. */
    buildBindGroup: [GPUBindGroup, GPUBindGroup];
    /** group(1) for solve: the built node array + sorted leaves. */
    treeBindGroup: GPUBindGroup;
    npad: number;
    sortPassCount: number;
}

/** A uniformly-random unit quaternion (Shoemake), xyzw. */
function randomQuat(): [number, number, number, number] {
    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    return [
        a * Math.sin(2 * Math.PI * u2),
        a * Math.cos(2 * Math.PI * u2),
        b * Math.sin(2 * Math.PI * u3),
        b * Math.cos(2 * Math.PI * u3),
    ];
}

/**
 * Seed a mix of spheres and oriented boxes of varied size, dropped above the
 * floor. Returns the packed `pose` (2 vec4/body) and `props` (4 vec4/body)
 * arrays. Mass and inverse inertia follow from shape + uniform density.
 */
function seedBodies(count: number, cfg: PhysicsConfig): { pose: Float32Array; props: Float32Array } {
    const pose = new Float32Array(count * 8);
    const props = new Float32Array(count * 16);
    const h = cfg.halfExtent;
    // Rain bodies down through a low-density column at random x/z so initial
    // overlaps are rare and impacts are staggered. (A rigid non-overlap lattice
    // collapses coherently and boils; dropping from too high just adds impact
    // energy — incremental robustness against overlap is the substepper's job.)
    const ySpan = 20;
    for (let i = 0; i < count; i++) {
        const isBox = Math.random() < BOX_FRACTION;
        const materialIndex = Math.floor(Math.random() * Material.list.length);
        const density = Material.properties[Material.list[materialIndex]].density;
        let he: [number, number, number];
        let boundingR: number;
        let mass: number;
        let invI: [number, number, number];
        let quat: [number, number, number, number];

        if (isBox) {
            he = [0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4];
            boundingR = Math.hypot(he[0], he[1], he[2]);
            mass = density * 8 * he[0] * he[1] * he[2];
            const ix = (mass / 3) * (he[1] * he[1] + he[2] * he[2]);
            const iy = (mass / 3) * (he[0] * he[0] + he[2] * he[2]);
            const iz = (mass / 3) * (he[0] * he[0] + he[1] * he[1]);
            invI = [1 / ix, 1 / iy, 1 / iz];
            quat = randomQuat();
        } else {
            const r = 0.3 + Math.random() * 0.6;
            he = [r, r, r];
            boundingR = r;
            mass = density * (4 / 3) * Math.PI * r * r * r;
            const i0 = 0.4 * mass * r * r;
            invI = [1 / i0, 1 / i0, 1 / i0];
            quat = [0, 0, 0, 1];
        }

        const p = i * 8;
        pose[p + 0] = (Math.random() * 2 - 1) * (h - boundingR);
        pose[p + 1] = cfg.floorY + 2 + Math.random() * ySpan;
        pose[p + 2] = (Math.random() * 2 - 1) * (h - boundingR);
        pose[p + 3] = boundingR;
        pose[p + 4] = quat[0]; pose[p + 5] = quat[1]; pose[p + 6] = quat[2]; pose[p + 7] = quat[3];

        const q = i * 16;
        props[q + 0] = (Math.random() * 2 - 1) * 1.5;  // vel.x
        props[q + 1] = 0;                               // vel.y
        props[q + 2] = (Math.random() * 2 - 1) * 1.5;  // vel.z
        props[q + 3] = 1 / mass;                        // invMass
        props[q + 4] = isBox ? (Math.random() * 2 - 1) * 2 : 0;  // angVel.x
        props[q + 5] = isBox ? (Math.random() * 2 - 1) * 2 : 0;  // angVel.y
        props[q + 6] = isBox ? (Math.random() * 2 - 1) * 2 : 0;  // angVel.z
        props[q + 8] = invI[0]; props[q + 9] = invI[1]; props[q + 10] = invI[2];
        props[q + 11] = materialIndex;  // persistent: solver never writes invInertia.w
        props[q + 12] = he[0]; props[q + 13] = he[1]; props[q + 14] = he[2];
        props[q + 15] = isBox ? SHAPE_BOX : SHAPE_SPHERE;
    }
    return { pose, props };
}

/** Flag the first few bodies to report their hits — the demo's event sources. */
function seedFlags(count: number): Uint32Array {
    const flags = new Uint32Array(count);
    for (let i = 0; i < Math.min(FLAGGED_BODY_COUNT, count); i++) {
        flags[i] = FLAG_REPORT_BODY_HITS;
    }
    return flags;
}

export const physics = Database.Plugin.create({
    extends: core,
    resources: {
        physicsConfig: {
            default: {
                gravity: 18,
                damping: 0.99,
                floorY: 0,
                halfExtent: 8,
            } satisfies PhysicsConfig as PhysicsConfig,
        },
        physicsBodyCount: { default: 400 as number, transient: true },
        physicsGpu: { default: null as PhysicsGpu | null, transient: true },
        physicsLastTime: { default: 0 as number, transient: true },
        physicsCurrent: { default: 0 as number, transient: true },
        physicsFrame: { default: 0 as number, transient: true },
        // Exposed to a renderer.
        physicsPositionBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsVelocityBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsRenderCount: { default: 0 as number, transient: true },
        physicsParticleBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsParticleCount: { default: 0 as number, transient: true },
        // Flag-gated collision events drained from the GPU.
        physicsCollisionEvents: { default: [] as CollisionEvent[], transient: true },
        physicsEventEpoch: { default: 0 as number, transient: true },
        physicsStagingState: { default: STAGING_FREE as number, transient: true },
    },
    transactions: {
        setPhysicsBodyCount(t, count: number) {
            t.resources.physicsBodyCount = count;
            t.resources.physicsGpu = null;
        },
    },
    systems: {
        physicsInit: {
            schedule: { during: ["postUpdate"] },
            create: db => () => {
                const { device, physicsGpu, physicsBodyCount, physicsConfig } = db.store.resources;
                if (!device || physicsGpu || physicsBodyCount === 0) return;

                const count = physicsBodyCount;
                const seed = seedBodies(count, physicsConfig);

                const params = device.createBuffer({ size: PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const buffer = (bytes: number) => device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const pose0 = buffer(count * POSE_STRIDE);
                const pose1 = buffer(count * POSE_STRIDE);
                const prev = buffer(count * POSE_STRIDE);
                const propsBuf = buffer(count * PROPS_STRIDE);
                const flags = buffer(count * 4);
                const events = device.createBuffer({ size: EVENTS_SIZE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                const staging = device.createBuffer({ size: EVENTS_SIZE, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(pose0, 0, seed.pose);
                device.queue.writeBuffer(pose1, 0, seed.pose);
                device.queue.writeBuffer(prev, 0, seed.pose);
                device.queue.writeBuffer(propsBuf, 0, seed.props);
                device.queue.writeBuffer(flags, 0, seedFlags(count));

                const module = device.createShaderModule({ code: physicsComputeShader });
                const layout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                    ],
                });
                // The solver also reads the LBVH (group 1); the other kernels use
                // only group 0.
                const treeLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                    ],
                });
                const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
                const solvePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout, treeLayout] });
                const pipeline = (entryPoint: string) => device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } });
                const bg = (poseIn: GPUBuffer, poseOut: GPUBuffer) => device.createBindGroup({
                    layout,
                    entries: [
                        { binding: 0, resource: { buffer: params } },
                        { binding: 1, resource: { buffer: poseIn } },
                        { binding: 2, resource: { buffer: poseOut } },
                        { binding: 3, resource: { buffer: prev } },
                        { binding: 4, resource: { buffer: propsBuf } },
                        { binding: 5, resource: { buffer: flags } },
                        { binding: 6, resource: { buffer: events } },
                    ],
                });

                // --- LBVH broadphase buffers + pipelines -------------------------
                const npad = nextPow2(count);
                const nodeCount = 2 * count - 1;
                const passes = bitonicPasses(npad);
                const bvhBounds = buffer(32);
                const bvhKeys = buffer(npad * 4);
                const bvhVals = buffer(npad * 4);
                const bvhNodes = buffer(nodeCount * BVH_NODE_STRIDE);
                const bvhParent = buffer(nodeCount * 4);
                const bvhFlags = buffer(count * 4);
                const bvhParams = device.createBuffer({ size: BVH_PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const sortParams = device.createBuffer({ size: passes.length * SORT_SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const bparams = new ArrayBuffer(BVH_PARAMS_SIZE);
                new Uint32Array(bparams, 0, 2).set([count, npad]);
                new Float32Array(bparams, 8, 1)[0] = BVH_MARGIN;
                device.queue.writeBuffer(bvhParams, 0, bparams);
                for (let p = 0; p < passes.length; p++) {
                    device.queue.writeBuffer(sortParams, p * SORT_SLOT, new Uint32Array([passes[p].j, passes[p].k, 0, 0]));
                }

                const bvhModule = device.createShaderModule({ code: broadphaseComputeShader });
                const buildLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
                    ],
                });
                const buildPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [buildLayout] });
                const buildPipe = (entryPoint: string) => device.createComputePipeline({ layout: buildPipelineLayout, compute: { module: bvhModule, entryPoint } });
                const buildBg = (poseBuf: GPUBuffer) => device.createBindGroup({
                    layout: buildLayout,
                    entries: [
                        { binding: 0, resource: { buffer: bvhParams } },
                        { binding: 1, resource: { buffer: poseBuf } },
                        { binding: 2, resource: { buffer: bvhBounds } },
                        { binding: 3, resource: { buffer: bvhKeys } },
                        { binding: 4, resource: { buffer: bvhVals } },
                        { binding: 5, resource: { buffer: bvhNodes } },
                        { binding: 6, resource: { buffer: bvhParent } },
                        { binding: 7, resource: { buffer: bvhFlags } },
                        { binding: 8, resource: { buffer: sortParams, size: 16 } },
                    ],
                });
                const treeBg = device.createBindGroup({
                    layout: treeLayout,
                    entries: [
                        { binding: 0, resource: { buffer: bvhNodes } },
                        { binding: 1, resource: { buffer: bvhVals } },
                    ],
                });

                // Query-only particles. Buffer starts zeroed → all dead → the
                // compute shader spawns each from the emitter on the first frame.
                const particleParams = device.createBuffer({ size: PARTICLE_PARAMS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                const particles = device.createBuffer({ size: PARTICLE_CAPACITY * PARTICLE_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const particleModule = device.createShaderModule({ code: particleComputeShader });
                const particleLayout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                    ],
                });
                const particlePipeline = device.createComputePipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [particleLayout] }),
                    compute: { module: particleModule, entryPoint: "step" },
                });
                const pbg = (bodies: GPUBuffer) => device.createBindGroup({
                    layout: particleLayout,
                    entries: [
                        { binding: 0, resource: { buffer: particleParams } },
                        { binding: 1, resource: { buffer: bodies } },
                        { binding: 2, resource: { buffer: particles } },
                    ],
                });

                db.store.resources.physicsGpu = {
                    params, pose: [pose0, pose1], prev, props: propsBuf, flags, events, staging,
                    integratePipeline: pipeline("integrate"),
                    reportPipeline: pipeline("report"),
                    solvePipeline: device.createComputePipeline({ layout: solvePipelineLayout, compute: { module, entryPoint: "solve" } }),
                    finalizePipeline: pipeline("finalize"),
                    bindGroup: [bg(pose0, pose1), bg(pose1, pose0)],
                    count,
                    particleParams, particles, particlePipeline,
                    particleBindGroup: [pbg(pose0), pbg(pose1)],
                    bvhFlags, bvhFlagsZero: new Uint32Array(count),
                    sceneBoundsPipeline: buildPipe("sceneBounds"),
                    mortonPipeline: buildPipe("morton"),
                    bitonicPipeline: buildPipe("bitonic"),
                    buildPipeline: buildPipe("build"),
                    leafBoundsPipeline: buildPipe("leafBounds"),
                    refitPipeline: buildPipe("refit"),
                    buildBindGroup: [buildBg(pose0), buildBg(pose1)],
                    treeBindGroup: treeBg,
                    npad,
                    sortPassCount: passes.length,
                };
                db.store.resources.physicsCurrent = 0;
                db.store.resources.physicsStagingState = STAGING_FREE;
                db.store.resources.physicsPositionBuffer = pose0;
                db.store.resources.physicsVelocityBuffer = propsBuf;
                db.store.resources.physicsRenderCount = count;
                db.store.resources.physicsParticleBuffer = particles;
                db.store.resources.physicsParticleCount = PARTICLE_CAPACITY;
            },
        },
        physicsStep: {
            schedule: { during: ["physics"] },
            create: db => () => {
                const { device, commandEncoder, physicsGpu, physicsConfig } = db.store.resources;
                if (!device || !commandEncoder || !physicsGpu) return;

                const now = performance.now();
                const last = db.store.resources.physicsLastTime || now;
                const dt = Math.min((now - last) / 1000, 0.033);
                db.store.resources.physicsLastTime = now;
                if (dt <= 0) return;

                const sub = dt / SUBSTEPS;
                const buf = new ArrayBuffer(PARAMS_SIZE);
                const f32 = new Float32Array(buf);
                const u32 = new Uint32Array(buf);
                f32[0] = sub;  // body kernels integrate per substep
                f32[1] = physicsConfig.gravity;
                f32[2] = physicsConfig.floorY;
                f32[3] = physicsConfig.halfExtent;
                // `damping` is a per-frame factor; finalize runs once per substep,
                // so spread it across the substeps (else it compounds 8× and the
                // sim crawls). 0.99/frame → 0.99^(1/8) per substep.
                f32[4] = Math.pow(physicsConfig.damping, 1 / SUBSTEPS);
                f32[5] = REPORT_THRESHOLD;
                u32[6] = physicsGpu.count;
                u32[7] = MAX_EVENTS;
                device.queue.writeBuffer(physicsGpu.params, 0, buf);
                // Reset the event counter + BVH refit flags; both ordered before
                // this frame's submit (so they land before the compute pass runs).
                device.queue.writeBuffer(physicsGpu.events, 0, new Uint32Array([0]));
                device.queue.writeBuffer(physicsGpu.bvhFlags, 0, physicsGpu.bvhFlagsZero);

                const wg = Math.ceil(physicsGpu.count / WORKGROUP);
                const wgPad = Math.ceil(physicsGpu.npad / WORKGROUP);
                const pass = commandEncoder.beginComputePass();
                let cur = db.store.resources.physicsCurrent;

                // Build the LBVH once per frame on the current poses (pose[cur]),
                // reused across all substeps — the leaf-AABB margin covers the
                // small per-frame drift, so we pay the build cost only once.
                const bb = physicsGpu.buildBindGroup[cur];
                pass.setBindGroup(0, bb, [0]);
                pass.setPipeline(physicsGpu.sceneBoundsPipeline);
                pass.dispatchWorkgroups(1);
                pass.setPipeline(physicsGpu.mortonPipeline);
                pass.dispatchWorkgroups(wgPad);
                pass.setPipeline(physicsGpu.bitonicPipeline);
                for (let p = 0; p < physicsGpu.sortPassCount; p++) {
                    pass.setBindGroup(0, bb, [p * SORT_SLOT]);
                    pass.dispatchWorkgroups(wgPad);
                }
                pass.setBindGroup(0, bb, [0]);
                pass.setPipeline(physicsGpu.buildPipeline);
                pass.dispatchWorkgroups(wg);
                pass.setPipeline(physicsGpu.leafBoundsPipeline);
                pass.dispatchWorkgroups(wg);
                pass.setPipeline(physicsGpu.refitPipeline);
                pass.dispatchWorkgroups(wg);

                // Flag-gated collision events, once per frame on the current poses.
                pass.setPipeline(physicsGpu.reportPipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);

                // Substep loop: integrate → solve → finalize, each over `sub`. With
                // one iteration per substep the ping-pong returns to `cur` each step.
                for (let s = 0; s < SUBSTEPS; s++) {
                    pass.setPipeline(physicsGpu.integratePipeline);
                    pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                    pass.dispatchWorkgroups(wg);
                    cur = 1 - cur;  // predicted poses now in pose[cur]

                    pass.setPipeline(physicsGpu.solvePipeline);
                    for (let k = 0; k < SOLVE_ITERS_PER_SUBSTEP; k++) {
                        pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                        pass.setBindGroup(1, physicsGpu.treeBindGroup);
                        pass.dispatchWorkgroups(wg);
                        cur = 1 - cur;
                    }

                    pass.setPipeline(physicsGpu.finalizePipeline);
                    pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                    pass.dispatchWorkgroups(wg);
                }

                // Query-only particles, once per frame over the full dt, after the
                // substeps so they read the bodies' final poses (pose[cur]).
                const frame = db.store.resources.physicsFrame + 1;
                db.store.resources.physicsFrame = frame;
                const pbuf = new ArrayBuffer(PARTICLE_PARAMS_SIZE);
                const pf32 = new Float32Array(pbuf);
                const pu32 = new Uint32Array(pbuf);
                pf32[0] = dt;
                pf32[1] = physicsConfig.gravity;
                pf32[2] = physicsConfig.floorY;
                pf32[3] = physicsConfig.halfExtent;
                pf32[4] = PARTICLE_RESTITUTION;
                pu32[5] = frame;
                pu32[6] = physicsGpu.count;
                pu32[7] = PARTICLE_CAPACITY;
                device.queue.writeBuffer(physicsGpu.particleParams, 0, pbuf);

                pass.setPipeline(physicsGpu.particlePipeline);
                pass.setBindGroup(0, physicsGpu.particleBindGroup[cur]);
                pass.dispatchWorkgroups(Math.ceil(PARTICLE_CAPACITY / WORKGROUP));
                pass.end();

                // Snapshot events into the mappable staging buffer when it's free.
                if (db.store.resources.physicsStagingState === STAGING_FREE) {
                    commandEncoder.copyBufferToBuffer(physicsGpu.events, 0, physicsGpu.staging, 0, EVENTS_SIZE);
                    db.store.resources.physicsStagingState = STAGING_COPIED;
                }

                db.store.resources.physicsCurrent = cur;
                db.store.resources.physicsPositionBuffer = physicsGpu.pose[cur];
                db.store.resources.physicsVelocityBuffer = physicsGpu.props;
                db.store.resources.physicsRenderCount = physicsGpu.count;
            },
        },
        physicsEventReadback: {
            // After the frame is submitted (postRender) the staging copy is in
            // flight; map it without blocking. The callback resolves a frame or
            // two later and publishes the drained events.
            schedule: { after: ["postRender"] },
            create: db => () => {
                const gpu = db.store.resources.physicsGpu;
                if (!gpu || db.store.resources.physicsStagingState !== STAGING_COPIED) return;

                db.store.resources.physicsStagingState = STAGING_MAPPED;
                gpu.staging.mapAsync(GPUMapMode.READ).then(() => {
                    const range = gpu.staging.getMappedRange();
                    const view = new DataView(range);
                    const total = Math.min(view.getUint32(0, true), MAX_EVENTS);
                    const events: CollisionEvent[] = [];
                    for (let k = 0; k < total; k++) {
                        const off = EVENT_HEADER + k * EVENT_RECORD;
                        events.push({
                            bodyA: view.getUint32(off + 0, true),
                            bodyB: view.getUint32(off + 4, true),
                            penetration: view.getFloat32(off + 8, true),
                        });
                    }
                    gpu.staging.unmap();
                    db.store.resources.physicsStagingState = STAGING_FREE;
                    if (events.length > 0) {
                        db.store.resources.physicsCollisionEvents = events;
                        db.store.resources.physicsEventEpoch = db.store.resources.physicsEventEpoch + 1;
                    }
                });
            },
        },
    },
});
