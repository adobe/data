// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import { physicsComputeShader } from "./physics-compute.wgsl.js";

/**
 * GPU XPBD physics — Phase A.
 *
 * GPU-authoritative: body state lives in ping-pong storage buffers, simulated
 * entirely on the GPU and exposed for rendering via `physicsRenderBuffer` /
 * `physicsRenderCount` (a renderer vertex-pulls instances from that buffer).
 * Depends only on `core` (device, command encoder, the `physics` frame phase) —
 * no graphics dependency, so the simulation is presentation-agnostic.
 *
 * Phase A integrates spheres under gravity and collides them with the static
 * world (ground plane + bin walls). Body-body collision (LBVH broadphase +
 * position constraints) arrives in Phase B.
 */

const PARAMS_SIZE = 32; // 8 × 4 bytes — see Params struct in the shader.
const BODY_STRIDE = 32; // 2 × vec4f.
const WORKGROUP = 64;

interface PhysicsConfig {
    gravity: number;
    substeps: number;
    restitution: number;
    friction: number;
    floorY: number;
    halfExtent: number;
}

interface PhysicsGpu {
    params: GPUBuffer;
    bodyA: GPUBuffer;
    bodyB: GPUBuffer;
    pipeline: GPUComputePipeline;
    /** computeBG[0]: in=A,out=B; computeBG[1]: in=B,out=A. */
    computeBG: [GPUBindGroup, GPUBindGroup];
    count: number;
}

/** Seed `count` spheres of varied size at rest above the floor, ready to drop. */
function seedBodies(count: number, cfg: PhysicsConfig): Float32Array {
    const data = new Float32Array(count * 8);
    const h = cfg.halfExtent;
    for (let i = 0; i < count; i++) {
        const r = 0.25 + Math.random() * 0.55;
        const x = (Math.random() * 2 - 1) * (h - r);
        const z = (Math.random() * 2 - 1) * (h - r);
        const y = cfg.floorY + 3 + Math.random() * 12;
        const o = i * 8;
        data[o + 0] = x;
        data[o + 1] = y;
        data[o + 2] = z;
        data[o + 3] = r;                       // radius
        data[o + 4] = (Math.random() * 2 - 1) * 2;  // small horizontal drift
        data[o + 5] = 0;
        data[o + 6] = (Math.random() * 2 - 1) * 2;
        data[o + 7] = 1 / (r * r * r);          // inverse mass ~ 1/volume (unused in A)
    }
    return data;
}

export const physics = Database.Plugin.create({
    extends: core,
    resources: {
        physicsConfig: {
            default: {
                gravity: 14,
                substeps: 4,
                restitution: 0.45,
                friction: 0.92,
                floorY: 0,
                halfExtent: 7,
            } satisfies PhysicsConfig as PhysicsConfig,
        },
        physicsBodyCount: { default: 300 as number, transient: true },
        physicsGpu: { default: null as PhysicsGpu | null, transient: true },
        physicsPingFrame: { default: 0 as number, transient: true },
        physicsLastTime: { default: 0 as number, transient: true },
        // Exposed to a renderer: the body buffer written this frame + its count.
        physicsRenderBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsRenderCount: { default: 0 as number, transient: true },
    },
    transactions: {
        setPhysicsBodyCount(t, count: number) {
            t.resources.physicsBodyCount = count;
            t.resources.physicsGpu = null; // force re-init
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

                const params = device.createBuffer({
                    size: PARAMS_SIZE,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                const makeBodyBuffer = () => {
                    const buf = device.createBuffer({
                        size: count * BODY_STRIDE,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    });
                    device.queue.writeBuffer(buf, 0, seed);
                    return buf;
                };
                const bodyA = makeBodyBuffer();
                const bodyB = makeBodyBuffer();

                const module = device.createShaderModule({ code: physicsComputeShader });
                const layout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                    ],
                });
                const pipeline = device.createComputePipeline({
                    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
                    compute: { module, entryPoint: "integrate" },
                });
                const bindGroup = (inBuf: GPUBuffer, outBuf: GPUBuffer) => device.createBindGroup({
                    layout,
                    entries: [
                        { binding: 0, resource: { buffer: params } },
                        { binding: 1, resource: { buffer: inBuf } },
                        { binding: 2, resource: { buffer: outBuf } },
                    ],
                });

                db.store.resources.physicsGpu = {
                    params, bodyA, bodyB, pipeline, count,
                    computeBG: [bindGroup(bodyA, bodyB), bindGroup(bodyB, bodyA)],
                };
                db.store.resources.physicsRenderBuffer = bodyA;
                db.store.resources.physicsRenderCount = count;
            },
        },
        physicsStep: {
            schedule: { during: ["physics"] },
            create: db => () => {
                const { device, commandEncoder, physicsGpu, physicsConfig } = db.store.resources;
                if (!device || !commandEncoder || !physicsGpu) return;

                const now = performance.now();
                const last = db.store.resources.physicsLastTime || now;
                const dt = Math.min((now - last) / 1000, 0.05);
                db.store.resources.physicsLastTime = now;
                if (dt <= 0) return;

                const params = new ArrayBuffer(PARAMS_SIZE);
                const f32 = new Float32Array(params);
                const u32 = new Uint32Array(params);
                f32[0] = dt;
                f32[1] = physicsConfig.gravity;
                f32[2] = physicsConfig.floorY;
                f32[3] = physicsConfig.halfExtent;
                f32[4] = physicsConfig.restitution;
                f32[5] = physicsConfig.friction;
                u32[6] = physicsConfig.substeps;
                u32[7] = physicsGpu.count;
                device.queue.writeBuffer(physicsGpu.params, 0, params);

                const ping = db.store.resources.physicsPingFrame & 1;
                const pass = commandEncoder.beginComputePass();
                pass.setPipeline(physicsGpu.pipeline);
                pass.setBindGroup(0, physicsGpu.computeBG[ping]);
                pass.dispatchWorkgroups(Math.ceil(physicsGpu.count / WORKGROUP));
                pass.end();

                // computeBG[0] writes B; computeBG[1] writes A.
                db.store.resources.physicsRenderBuffer = ping === 0 ? physicsGpu.bodyB : physicsGpu.bodyA;
                db.store.resources.physicsRenderCount = physicsGpu.count;
                db.store.resources.physicsPingFrame = db.store.resources.physicsPingFrame + 1;
            },
        },
    },
});
