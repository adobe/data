// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import { physicsComputeShader } from "./physics-compute.wgsl.js";

/**
 * GPU XPBD physics — Phase B.
 *
 * GPU-authoritative: body state lives in storage buffers, simulated entirely on
 * the GPU and exposed via `physicsPositionBuffer` / `physicsVelocityBuffer` /
 * `physicsRenderCount` for a renderer to vertex-pull. Depends only on `core`.
 *
 * Per frame: integrate (predict) → K Jacobi solve iterations (sphere-sphere
 * contacts + static world) → finalize (velocity from position delta). Spheres
 * fall, collide with each other, and stack. Body-body neighbour search is
 * currently brute-force O(N²) — a placeholder for the LBVH broadphase.
 */

const PARAMS_SIZE = 32;  // 8 × 4 bytes — see Params struct in the shader.
const VEC4 = 16;
const WORKGROUP = 64;
const SOLVE_ITERATIONS = 4;

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
    integratePipeline: GPUComputePipeline;
    solvePipeline: GPUComputePipeline;
    finalizePipeline: GPUComputePipeline;
    /** bg[r]: posIn = pos[r], posOut = pos[1-r]. */
    bindGroup: [GPUBindGroup, GPUBindGroup];
    count: number;
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
        // Exposed to a renderer.
        physicsPositionBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsVelocityBuffer: { default: null as GPUBuffer | null, transient: true },
        physicsRenderCount: { default: 0 as number, transient: true },
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
                device.queue.writeBuffer(pos0, 0, seed.pos);
                device.queue.writeBuffer(pos1, 0, seed.pos);
                device.queue.writeBuffer(vel, 0, seed.vel);

                const module = device.createShaderModule({ code: physicsComputeShader });
                const layout = device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
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
                    ],
                });

                db.store.resources.physicsGpu = {
                    params, pos: [pos0, pos1], vel, prevPos,
                    integratePipeline: pipeline("integrate"),
                    solvePipeline: pipeline("solve"),
                    finalizePipeline: pipeline("finalize"),
                    bindGroup: [bg(pos0, pos1), bg(pos1, pos0)],
                    count,
                };
                db.store.resources.physicsCurrent = 0;
                db.store.resources.physicsPositionBuffer = pos0;
                db.store.resources.physicsVelocityBuffer = vel;
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
                u32[6] = physicsGpu.count;
                device.queue.writeBuffer(physicsGpu.params, 0, buf);

                const wg = Math.ceil(physicsGpu.count / WORKGROUP);
                const pass = commandEncoder.beginComputePass();
                let cur = db.store.resources.physicsCurrent;

                pass.setPipeline(physicsGpu.integratePipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);
                cur = 1 - cur;

                pass.setPipeline(physicsGpu.solvePipeline);
                for (let k = 0; k < SOLVE_ITERATIONS; k++) {
                    pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                    pass.dispatchWorkgroups(wg);
                    cur = 1 - cur;
                }

                pass.setPipeline(physicsGpu.finalizePipeline);
                pass.setBindGroup(0, physicsGpu.bindGroup[cur]);
                pass.dispatchWorkgroups(wg);
                pass.end();

                db.store.resources.physicsCurrent = cur;
                db.store.resources.physicsPositionBuffer = physicsGpu.pos[cur];
                db.store.resources.physicsVelocityBuffer = physicsGpu.vel;
                db.store.resources.physicsRenderCount = physicsGpu.count;
            },
        },
    },
});
