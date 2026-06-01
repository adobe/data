// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import { physicsComputeShader } from "./physics-compute.wgsl.js";
import { particleComputeShader } from "./particle-compute.wgsl.js";
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
const SOLVE_ITERATIONS = 6;

const SHAPE_SPHERE = 0;
const SHAPE_BOX = 1;
const BOX_FRACTION = 0.4;  // share of bodies that are cuboids
const DENSITY = 1;

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
    for (let i = 0; i < count; i++) {
        const isBox = Math.random() < BOX_FRACTION;
        let he: [number, number, number];
        let boundingR: number;
        let mass: number;
        let invI: [number, number, number];
        let quat: [number, number, number, number];

        if (isBox) {
            he = [0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4];
            boundingR = Math.hypot(he[0], he[1], he[2]);
            mass = DENSITY * 8 * he[0] * he[1] * he[2];
            const ix = (mass / 3) * (he[1] * he[1] + he[2] * he[2]);
            const iy = (mass / 3) * (he[0] * he[0] + he[2] * he[2]);
            const iz = (mass / 3) * (he[0] * he[0] + he[1] * he[1]);
            invI = [1 / ix, 1 / iy, 1 / iz];
            quat = randomQuat();
        } else {
            const r = 0.3 + Math.random() * 0.6;
            he = [r, r, r];
            boundingR = r;
            mass = DENSITY * (4 / 3) * Math.PI * r * r * r;
            const i0 = 0.4 * mass * r * r;
            invI = [1 / i0, 1 / i0, 1 / i0];
            quat = [0, 0, 0, 1];
        }

        const p = i * 8;
        pose[p + 0] = (Math.random() * 2 - 1) * (h - boundingR);
        pose[p + 1] = cfg.floorY + 2 + Math.random() * 18;
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
                const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
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
                    solvePipeline: pipeline("solve"),
                    finalizePipeline: pipeline("finalize"),
                    bindGroup: [bg(pose0, pose1), bg(pose1, pose0)],
                    count,
                    particleParams, particles, particlePipeline,
                    particleBindGroup: [pbg(pose0), pbg(pose1)],
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
