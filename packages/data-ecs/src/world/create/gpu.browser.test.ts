import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
import { Gpu } from "../../gpu/gpu.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

type Vec3 = readonly [number, number, number];
const vec3: Schema.ForType<Vec3> = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 };
const position = "gpuTest/position";
const velocity = "gpuTest/velocity";
const score = "gpuTest/score";
const tag = "gpuTest/tag";
const code = "gpuTest/code";
const amount = "gpuTest/amount";
const flag = "gpuTest/flag";
const followed = "gpuTest/followed";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec3;
        [velocity]: Vec3;
        [score]: number;
        [tag]: true;
        [code]: number;
        [amount]: number;
        [flag]: boolean;
        [followed]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "gpuTest/spawn": true;
        "gpuTest/move": true;
        "gpuTest/moveAgain": true;
        "gpuTest/reset": true;
        "gpuTest/frame": true;
        "gpuTest/spawnOne": true;
        "gpuTest/grow": true;
        "gpuTest/copy": true;
        "gpuTest/entityScore": true;
        "gpuTest/watch": true;
        "gpuTest/turn": true;
        "gpuTest/turning": true;
        "gpuTest/moveLater": true;
        "gpuTest/spawnNumbers": true;
        "gpuTest/numbers": true;
        "gpuTest/flagScore": true;
        "gpuTest/spawnFollower": true;
        "gpuTest/follow": true;
        "gpuTest/following": true;
        "gpuTest/poison": true;
        "gpuTest/fail": true;
        "gpuTest/failing": true;
        "gpuTest/churn": true;
    }
}

Component.register(position, vec3);
Component.register(velocity, vec3);
Component.register(score, { type: "number", precision: 1 });
Component.register(tag, { const: true });
Component.register(code, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF });
Component.register(amount, { type: "number", precision: 1 });
Component.register(flag, { type: "boolean" });
Component.register(followed, { type: "number" });

const count = 5000;

const spawn = System.create({ name: "gpuTest/spawn" }, (_, __, commands) => {
    for (let i = 0; i < count; i++) {
        if (i % 2 === 0) commands.spawn({ [position]: [i, 0, -i], [velocity]: [1, i % 7, 0.5] });
        else commands.spawn({ [position]: [i, 0, -i], [velocity]: [1, i % 7, 0.5], [tag]: true });
    }
});

const move = System.create({ name: "gpuTest/move", kernel: "gpu", query: { read: [position, velocity], write: [position] } }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy * 2, pz + vz];
});

const moveAgain = System.create({ name: "gpuTest/moveAgain", kernel: "gpu", query: { read: [position, velocity], write: [position] }, after: ["gpuTest/reset"] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

/** Between two GPU kernels: reads what the first wrote, and changes what both read. */
const reset = System.create({ name: "gpuTest/reset", query: { read: [position, velocity], write: [position, velocity] }, after: ["gpuTest/move"] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px * 2, py, pz + 100];
    row[velocity] = [vz, vx, vy];
});

/** Between two GPU kernels: changes only what they read, so nothing needs reading back first. */
const turn = System.create({ name: "gpuTest/turn", query: { read: [velocity], write: [velocity] }, after: ["gpuTest/move"] }, row => {
    const [vx, vy, vz] = row[velocity];
    row[velocity] = [vz * 3, vx, vy];
});

const moveLater = System.create({ name: "gpuTest/moveLater", kernel: "gpu", query: { read: [position, velocity], write: [position] }, after: ["gpuTest/turn"] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

const turning = System.composite({ name: "gpuTest/turning", systems: [move, turn, moveLater] });

const spawnNumbers = System.create({ name: "gpuTest/spawnNumbers" }, (_, __, commands) => {
    for (const [c, a] of [[0, 0], [3, -2.5], [0xff00ff00, 2.5], [0xffffff00, 7], [0x80000000, -0.25]]) commands.spawn({ [code]: c, [amount]: a });
});

/**
 * JS semantics the GPU keeps: u32 values past 2^31, bitwise operators, infinities, rounding. Every GPU value is an
 * f32, so only integers f32 holds exactly are compared; WGSL lets implementations assume no value is NaN.
 */
const numbers = System.create({ name: "gpuTest/numbers", kernel: "gpu", query: { read: [code, amount], write: [code, amount] } }, row => {
    const c = row[code];
    const a = row[amount];
    row[code] = (c & 0xff00ff00) >>> 0;
    row[amount] = Math.min(a, Infinity) + Math.round(a) + (-Infinity < a ? 1000 : 0) + ~(c >>> 28) + (c >>> 24) + (c | 0) / 0x1000000;
});

const flagScore = System.create({ name: "gpuTest/flagScore", kernel: "gpu", query: { read: [flag], write: [score] } }, row => {
    row[score] = row[flag] ? 1 : 0;
});

const spawnFollower = System.create({ name: "gpuTest/spawnFollower" }, (_, __, commands) => {
    const leader = commands.spawn({ [position]: [10, 0, 0], [velocity]: [5, 0, 0] });
    commands.spawn({ [followed]: leader, [score]: 0 });
});

/** On the CPU, reads through a lookup what a GPU kernel wrote. */
const follow = System.create({
    name: "gpuTest/follow",
    query: { read: [followed], write: [score] },
    lookup: { leader: { read: [position] } },
    after: ["gpuTest/move"],
}, (row, { leader }) => {
    row[score] = leader(row[followed])?.[position][0] ?? -1;
});

const following = System.composite({ name: "gpuTest/following", systems: [move, follow] });

/** Despawns the first entity, moving the last into its row, then makes the sync point throw. */
const poison = System.create({ name: "gpuTest/poison", query: { read: [position] } }, (row, _, commands) => {
    if (row[position][0] === 2) commands.despawn(row.entity);
    if (row[position][0] === 4) commands.add(row.entity, { [score]: Symbol("poison") as unknown as number });
});

let frameNumber = 0;
const spawnedNow: Entity[] = [];

/** Spawns a few particles each frame, through growth of their archetypes; nothing on the CPU reads their positions. */
const spawnFew = System.create({ name: "gpuTest/churn" }, (_, __, commands) => {
    for (let i = 0; i < 37; i++) spawnedNow.push(commands.spawn({ [position]: [frameNumber, i, 0], [velocity]: [1, i % 3, 0.25] }));
    // Every fifth frame, a despawn moves another particle into a row the GPU wrote.
    if (frameNumber % 5 === 4) commands.despawn(spawnedNow[frameNumber * 3]);
});

/** A render body that fails after starting its pass. */
const fail = System.render({ name: "gpuTest/fail", query: { read: [position] }, render: { accessors: { place: position } }, after: ["gpuTest/move"] }, ({ encoder }) => {
    encoder.beginComputePass();
    throw new Error("draw failed");
});

const failing = System.composite({ name: "gpuTest/failing", systems: [move, fail] });

/** Reads the entity, an f64. */
const entityScore = System.create({ name: "gpuTest/entityScore", kernel: "gpu", query: { read: [score], write: [score] } }, row => {
    row[score] = row.entity;
});

const watch = System.create({ name: "gpuTest/watch", query: { read: [score], changed: [position] } }, () => {});

const frame = System.composite({ name: "gpuTest/frame", systems: [move, reset, moveAgain] });

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const positions = (world: ReturnType<typeof createWorld>): Vec3[] =>
    world.query.select([position]).map((entity: Entity) => world.read.component(entity, position) ?? [NaN, NaN, NaN]);

describe("GPU kernels", () => {
    // Each comparison runs the same GPU kernels in a world without a GPU, where they run on the CPU.
    it("write values that reach the CPU after synchronize, as the CPU kernel's do", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.systems.register(spawn, move);
            await world.run(spawn);
            for (let i = 0; i < 3; i++) await world.run(move);
        }
        // Until synchronized, reads see the values before the GPU wrote them.
        expect(positions(gpuWorld)[0]).toEqual([0, 0, -0]);
        await gpuWorld.synchronize([position]);
        expect(positions(gpuWorld)).toEqual(positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("see main-thread writes made between them in the same run, and the main thread sees theirs", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.systems.register(spawn, frame);
            await world.run(spawn);
            await world.run(frame);
            await world.run(frame);
        }
        await gpuWorld.synchronize([position]);
        expect(positions(gpuWorld)).toEqual(positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("see main-thread writes to what they only read, made between them in the same run", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.systems.register(spawn, turning);
            await world.run(spawn);
            await world.run(turning);
        }
        await gpuWorld.synchronize([position]);
        expect(positions(gpuWorld)).toEqual(positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("keep their writes when the sync point moves rows of their archetypes", async () => {
        const spawnOne = System.create({ name: "gpuTest/spawnOne" }, (_, __, commands) => {
            commands.spawn({ [position]: [-1, -1, -1], [velocity]: [0, 0, 0] });
        });
        const world = createWorld({ gpu: { device: await device() } });
        await world.systems.register(spawn, move, spawnOne);
        await world.run(spawn);
        await world.run(move);
        await world.run(spawnOne);
        await world.run(move);
        await world.synchronize([position]);
        const all = positions(world);
        expect(all.length).toBe(count + 1);
        expect(all.filter(([x]) => x === -1)).toEqual([[-1, -1, -1]]);
        // Moved twice: once before the spawn's sync point and once after.
        expect(all.filter(([x]) => x === 2)).toEqual([[2, 0, 1]]);
        await world.dispose();
    });

    it("keep JS semantics for u32 values, bitwise operators and infinities", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        const read = (world: ReturnType<typeof createWorld>): unknown[] => world.query.select([code]).map(entity => world.read.entity(entity, [code, amount]));
        for (const world of [gpuWorld, cpuWorld]) {
            await world.systems.register(spawnNumbers, numbers);
            await world.run(spawnNumbers);
            await world.run(numbers);
        }
        await gpuWorld.synchronize([code, amount]);
        expect(read(gpuWorld)).toEqual(read(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("are read back for CPU systems that look them up", async () => {
        const world = createWorld({ gpu: { device: await device() } });
        await world.systems.register(spawnFollower, following);
        await world.run(spawnFollower);
        await world.run(following);
        await world.run(following);
        const [follower] = world.query.select([followed]);
        expect(world.read.component(follower, score)).toBe(20);
        await world.dispose();
    });

    it("keep their copies current when a sync point fails partway", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.systems.register(spawn, move, poison);
            await world.run(spawn);
            await world.run(move);
            await expect(world.run(poison)).rejects.toThrow();
            await world.run(move);
        }
        await gpuWorld.synchronize([position]);
        expect(positions(gpuWorld)).toEqual(positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("keep their writes as spawns grow their archetypes and despawns move rows", async () => {
        const gpuWorld = createWorld({ gpu: { device: await device() } });
        const cpuWorld = createWorld({ workers: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            spawnedNow.length = 0;
            await world.systems.register(spawnFew, move);
            for (frameNumber = 0; frameNumber < 40; frameNumber++) {
                await world.run(spawnFew);
                await world.run(move);
            }
        }
        await gpuWorld.synchronize([position]);
        expect(positions(gpuWorld).length).toBe(positions(cpuWorld).length);
        expect(positions(gpuWorld)).toEqual(positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("refuse what they can't run, with the reason", async () => {
        const world = createWorld({ gpu: { device: await device() } });
        await expect(world.systems.register(entityScore)).rejects.toThrow(/can't run on the GPU: it reads an f64 value/);
        await expect(world.systems.register(flagScore)).rejects.toThrow(/reads a byte value/);
        // In a world without a GPU too: the declaration can never hold.
        const cpuWorld = createWorld({ workers: 0 });
        await expect(cpuWorld.systems.register(flagScore)).rejects.toThrow(/reads a byte value/);
        await cpuWorld.dispose();
        await world.systems.register(move);
        await expect(world.systems.register(watch)).rejects.toThrow(/filters on with `changed`/);
        await world.dispose();
    });
});

describe("render systems", () => {
    it("that fail lose only their own work", async () => {
        const world = createWorld({ gpu: { device: await device() } });
        await world.systems.register(spawn, failing);
        await world.run(spawn);
        await expect(world.run(failing)).rejects.toThrow("draw failed");
        await world.synchronize([position]);
        expect(positions(world)[0]).toEqual([1, 0, 0.5]);
        await world.dispose();
    });

    it("name accessors anything WGSL allows, and only that", async () => {
        const gpu = await device();
        const named = (name: string) => System.render({ name: "gpuTest/copy", query: { read: [position] }, render: { accessors: { [name]: position } } }, () => {});
        const module = gpu.createShaderModule({ code: `${Gpu.wgsl(named("count"))}\n@compute @workgroup_size(1) fn main() { _ = count(0u); }` });
        expect((await module.getCompilationInfo()).messages.filter(message => message.type === "error")).toEqual([]);
        expect(() => Gpu.wgsl(named("target"))).toThrow(/isn't usable as a WGSL function name/);
    });

    it("read their components on the GPU through the generated accessors", async () => {
        const gpu = await device();
        const output = gpu.createBuffer({ size: count * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const copy = System.render({
            name: "gpuTest/copy",
            query: { read: [position], has: [tag] },
            render: { group: 0, accessors: { place: position } },
            after: ["gpuTest/move"],
        }, ({ encoder, tables }) => {
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(1, outputGroup);
            for (const table of tables) {
                table.bind(pass);
                pass.dispatchWorkgroups(Math.ceil(table.count / 64));
            }
            pass.end();
        });
        const world = createWorld({ gpu: { device: gpu } });
        if (world.gpu === null) throw new Error("No GPU.");
        const outputLayout = gpu.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }] });
        const outputGroup = gpu.createBindGroup({ layout: outputLayout, entries: [{ binding: 0, resource: { buffer: output } }] });
        const module = gpu.createShaderModule({
            code: `${Gpu.wgsl(copy)}
@group(1) @binding(0) var<storage, read_write> output: array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ecs_count()) { return; }
    output[id.x] = vec4f(place(id.x), 1.0);
}`,
        });
        const pipeline = gpu.createComputePipeline({ layout: gpu.createPipelineLayout({ bindGroupLayouts: [world.gpu.layout, outputLayout] }), compute: { module, entryPoint: "main" } });
        const frameWithCopy = System.composite({ name: "gpuTest/frame", systems: [move, copy] });
        await world.systems.register(spawn, frameWithCopy);
        await world.run(spawn);
        await world.run(frameWithCopy);
        const staging = gpu.createBuffer({ size: output.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const encoder = gpu.createCommandEncoder();
        encoder.copyBufferToBuffer(output, 0, staging, 0, output.size);
        gpu.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const copied = new Float32Array(staging.getMappedRange());
        // The tagged entities are the odd ones, in spawn order, each moved once.
        const expected = Array.from({ length: count / 2 }, (_, k) => {
            const i = 2 * k + 1;
            return [i + 1, (i % 7) * 2, -i + 0.5, 1];
        });
        expect(Array.from({ length: count / 2 }, (_, k) => Array.from(copied.subarray(k * 4, k * 4 + 4)))).toEqual(expected);
        await world.dispose();
    });
});
