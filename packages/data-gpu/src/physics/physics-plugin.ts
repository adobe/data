// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import { physicsComputeShader } from "./physics-compute.wgsl.js";
import { particleComputeShader } from "./particle-compute.wgsl.js";
import type { CollisionEvent } from "./collision-event.js";

/**
 * GPU XPBD physics — Phase C.
 *
 * GPU-authoritative: body state lives in storage buffers, simulated entirely on
 * the GPU and exposed via `physicsPositionBuffer` / `physicsVelocityBuffer` /
 * `physicsRenderCount` for a renderer to vertex-pull. Depends only on `core`.
 *
 * Per frame: integrate (predict) → report (flag-gated collision events) → K
 * Jacobi solve iterations (sphere-sphere contacts + static world) → finalize
 * (velocity from position delta). Spheres fall, collide, and stack. Body-body
 * neighbour search is currently brute-force O(N²) — a placeholder for the LBVH
 * broadphase.
 *
 * Collision events: bodies flagged `REPORT_BODY_HITS` append to a GPU
 * append-buffer (atomic counter + records). The buffer is copied to a mappable
 * staging buffer and drained on the CPU into `physicsCollisionEvents`, with
 * `physicsEventEpoch` bumped per batch so a consumer can log only new events.
 * Readback is double-buffered via a small state machine — never stalls the
 * frame. Cost is proportional to the number of flagged bodies.
 */

const PARAMS_SIZE = 32;  // 8 × 4 bytes — see Params struct in the shader.
const VEC4 = 16;
const WORKGROUP = 64;
const SOLVE_ITERATIONS = 4;

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

interface PhysicsConfig {
    gravity: number;
    damping: number;
    floorY: number;
    halfExtent: number;
}

interface PhysicsGpu {
    params: GPUBuffer;
    pos: [GPUBuffer, GPUBuffer];   // ping-pong, xyz + radius
    vel: GPUBuffer;                // xyz + invMass
    prevPos: GPUBuffer;            // xyz
    flags: GPUBuffer;              // u32 per body
    events: GPUBuffer;             // atomic counter + records (storage, COPY_SRC)
    staging: GPUBuffer;            // mappable copy of `events` (MAP_READ, COPY_DST)
    integratePipeline: GPUComputePipeline;
    reportPipeline: GPUComputePipeline;
    solvePipeline: GPUComputePipeline;
    finalizePipeline: GPUComputePipeline;
    /** bg[r]: posIn = pos[r], posOut = pos[1-r]. */
    bindGroup: [GPUBindGroup, GPUBindGroup];
    count: number;
    // Query-only particles.
    particleParams: GPUBuffer;
    particles: GPUBuffer;
    particlePipeline: GPUComputePipeline;
    /** particleBindGroup[r] reads the bodies in pos[r] (final positions). */
    particleBindGroup: [GPUBindGroup, GPUBindGroup];
}

/** Seed spheres of varied size at rest above the floor. Returns pos + vel arrays. */
function seedBodies(count: number, cfg: PhysicsConfig): { pos: Float32Array; vel: Float32Array } {
    const pos = new Float32Array(count * 4);
    const vel = new Float32Array(count * 4);
    const h = cfg.halfExtent;
    for (let i = 0; i < count; i++) {
        const r = 0.3 + Math.random() * 0.6;
        const o = i * 4;
        pos[o + 0] = (Math.random() * 2 - 1) * (h - r);
        pos[o + 1] = cfg.floorY + 2 + Math.random() * 18;
        pos[o + 2] = (Math.random() * 2 - 1) * (h - r);
        pos[o + 3] = r;
        vel[o + 0] = (Math.random() * 2 - 1) * 1.5;
        vel[o + 1] = 0;
        vel[o + 2] = (Math.random() * 2 - 1) * 1.5;
        vel[o + 3] = 1 / (r * r * r);  // inverse mass ~ 1/volume
    }
    return { pos, vel };
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
                const storage = () => device.createBuffer({ size: count * VEC4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const pos0 = storage();
                const pos1 = storage();
                const vel = storage();
                const prevPos = storage();
                const flags = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                const events = device.createBuffer({ size: EVENTS_SIZE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                const staging = device.createBuffer({ size: EVENTS_SIZE, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
                device.queue.writeBuffer(pos0, 0, seed.pos);
                device.queue.writeBuffer(pos1, 0, seed.pos);
                device.queue.writeBuffer(vel, 0, seed.vel);
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
                const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
                const pipeline = (entryPoint: string) => device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } });
                const bg = (posIn: GPUBuffer, posOut: GPUBuffer) => device.createBindGroup({
                    layout,
                    entries: [
                        { binding: 0, resource: { buffer: params } },
                        { binding: 1, resource: { buffer: posIn } },
                        { binding: 2, resource: { buffer: posOut } },
                        { binding: 3, resource: { buffer: vel } },
                        { binding: 4, resource: { buffer: prevPos } },
                        { binding: 5, resource: { buffer: flags } },
                        { binding: 6, resource: { buffer: events } },
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
                    params, pos: [pos0, pos1], vel, prevPos, flags, events, staging,
                    integratePipeline: pipeline("integrate"),
                    reportPipeline: pipeline("report"),
                    solvePipeline: pipeline("solve"),
                    finalizePipeline: pipeline("finalize"),
                    bindGroup: [bg(pos0, pos1), bg(pos1, pos0)],
                    count,
                    particleParams, particles, particlePipeline,
                    particleBindGroup: [pbg(pos0), pbg(pos1)],
                };
                db.store.resources.physicsCurrent = 0;
                db.store.resources.physicsStagingState = STAGING_FREE;
                db.store.resources.physicsPositionBuffer = pos0;
                db.store.resources.physicsVelocityBuffer = vel;
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

                const buf = new ArrayBuffer(PARAMS_SIZE);
                const f32 = new Float32Array(buf);
                const u32 = new Uint32Array(buf);
                f32[0] = dt;
                f32[1] = physicsConfig.gravity;
                f32[2] = physicsConfig.floorY;
                f32[3] = physicsConfig.halfExtent;
                f32[4] = physicsConfig.damping;
                f32[5] = REPORT_THRESHOLD;
                u32[6] = physicsGpu.count;
                u32[7] = MAX_EVENTS;
                device.queue.writeBuffer(physicsGpu.params, 0, buf);
                // Reset the event counter; ordered before this frame's submit.
                device.queue.writeBuffer(physicsGpu.events, 0, new Uint32Array([0]));

                const wg = Math.ceil(physicsGpu.count / WORKGROUP);
                const pass = commandEncoder.beginComputePass();
                let cur = db.store.resources.physicsCurrent;

                pass.setPipeline(physicsGpu.integratePipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);
                cur = 1 - cur;

                // Report on the predicted positions (deepest penetration), before
                // the solver resolves them. Read-only on positions, so no flip.
                pass.setPipeline(physicsGpu.reportPipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);

                pass.setPipeline(physicsGpu.solvePipeline);
                for (let k = 0; k < SOLVE_ITERATIONS; k++) {
                    pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                    pass.dispatchWorkgroups(wg);
                    cur = 1 - cur;
                }

                pass.setPipeline(physicsGpu.finalizePipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);

                // Query-only particles, after the rigid solve so they read the
                // bodies' final positions (pos[cur]). One-way: read bodies, write
                // only the particle buffer.
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
                db.store.resources.physicsPositionBuffer = physicsGpu.pos[cur];
                db.store.resources.physicsVelocityBuffer = physicsGpu.vel;
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
