import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Gpu } from "../../interface/gpu/gpu.js";
import { Mat4x4, Quat, Vec3 } from "../../interface/math/index.js";
import type { Schema } from "../../interface/schema/schema.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { System } from "../../interface/system/system.js";
import { read, readEach, readEntity, readResource, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;
const position = Symbol("gpuTest/position");
const velocity = Symbol("gpuTest/velocity");
const score = Symbol("gpuTest/score");
const tag = Symbol("gpuTest/tag");
const code = Symbol("gpuTest/code");
const amount = Symbol("gpuTest/amount");
const flag = Symbol("gpuTest/flag");
const followed = Symbol("gpuTest/followed");
const bits = Symbol("gpuTest/bits");
const sums = Symbol("gpuTest/sums");
const ownedBy = Symbol("gpuTest/ownedBy");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
        [score]: typeof scoreTraits;
        [tag]: typeof tagTraits;
        [code]: typeof codeTraits;
        [amount]: typeof amountTraits;
        [flag]: typeof flagTraits;
        [followed]: typeof followedTraits;
        [bits]: typeof bitsTraits;
        [sums]: typeof sumsTraits;
        [ownedBy]: typeof ownedByTraits;
    }
}

const positionTraits = Component.register(position, { type: vec3 });
const velocityTraits = Component.register(velocity, { type: vec3 });
const scoreTraits = Component.register(score, { type: { type: "number", precision: 1 } });
const tagTraits = Component.register(tag, { type: { const: true } });
const codeTraits = Component.register(code, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
const amountTraits = Component.register(amount, { type: { type: "number", precision: 1 } });
const flagTraits = Component.register(flag, { type: { type: "boolean" } });
const followedTraits = Component.register(followed, { type: Entity.schema });
const ownedByTraits = Component.register(ownedBy, { type: Entity.schema, reference: "owner" });

const count = 5000;

const spawn = System.create({ name: "gpuTest/spawn" }, ({ commands }) => {
    for (let i = 0; i < count; i++) {
        if (i % 2 === 0) commands.spawn([position, velocity])({ [position]: [i, 0, -i], [velocity]: [1, i % 7, 0.5] });
        else commands.spawn([position, velocity, tag])({ [position]: [i, 0, -i], [velocity]: [1, i % 7, 0.5], [tag]: true });
    }
});

const move = System.create({ name: "gpuTest/move", kernel: "gpu", components: { read: [velocity], write: [position] } }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy * 2, pz + vz];
});

/** Between two GPU kernels: reads what the first wrote, and changes what both read. */
const reset = System.create({ name: "gpuTest/reset", components: { write: [position, velocity] }, after: [move] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px * 2, py, pz + 100];
    row[velocity] = [vz, vx, vy];
});

const moveAgain = System.create({ name: "gpuTest/moveAgain", kernel: "gpu", components: { read: [velocity], write: [position] }, after: [reset] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

/** Between two GPU kernels: changes only what they read, so nothing needs reading back first. */
const turn = System.create({ name: "gpuTest/turn", components: { write: [velocity] }, after: [move] }, row => {
    const [vx, vy, vz] = row[velocity];
    row[velocity] = [vz * 3, vx, vy];
});

const moveLater = System.create({ name: "gpuTest/moveLater", kernel: "gpu", components: { read: [velocity], write: [position] }, after: [turn] }, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

const turning = System.composite({ name: "gpuTest/turning", systems: [move, turn, moveLater] });

const spawnNumbers = System.create({ name: "gpuTest/spawnNumbers" }, ({ commands }) => {
    for (const [c, a] of [[0, 0], [3, -2.5], [0xff00ff00, 2.5], [0xffffff00, 7], [0x80000000, -0.25]]) commands.spawn([code, amount])({ [code]: c, [amount]: a });
});

/**
 * JS semantics the GPU keeps: u32 values past 2^31, integer and bitwise chains bit for bit, infinities, rounding.
 * Arithmetic is f32, so only results f32 holds exactly are compared; WGSL lets implementations assume no value is NaN.
 */
const numbers = System.create({ name: "gpuTest/numbers", kernel: "gpu", components: { write: [code, amount] } }, row => {
    const c = row[code];
    const a = row[amount];
    const mixed = (c ^ 0x0f0f0f0f) >>> 0;
    row[code] = mixed > 0x80000000 ? mixed : (c & 0xff00ff00) >>> 0;
    row[amount] = Math.min(a, Infinity) + Math.round(a) + (-Infinity < a ? 1000 : 0) + (~c & 0xff) + ~(c >>> 28) + (c >>> 24)
        + (c | 0) / 0x1000000 + Math.clz32(c) + (c > 0x80000000 ? 10000 : 0) + Math.max(a, -1) * 100 + (a % 1.5) * 10000;
});

const flagScore = System.create({ name: "gpuTest/flagScore", kernel: "gpu", components: { read: [flag], write: [score] } }, row => {
    row[score] = row[flag] ? 1 : 0;
});

const spawnFollower = System.create({ name: "gpuTest/spawnFollower" }, ({ commands }) => {
    const leader = commands.spawn([position, velocity])({ [position]: [10, 0, 0], [velocity]: [5, 0, 0] });
    commands.spawn([followed, score])({ [followed]: leader, [score]: 0 });
});

/** On the CPU, reads through a lookup what a GPU kernel wrote. */
const follow = System.create({
    name: "gpuTest/follow",
    components: { read: [followed], write: [score] },
    lookup: { leader: { read: [position] } },
    after: [move],
}, (row, { lookup: { leader } }) => {
    row[score] = leader(row[followed])?.[position][0] ?? -1;
});

const following = System.composite({ name: "gpuTest/following", systems: [move, follow] });

/** Despawns the first entity, moving the last into its row, then makes the sync point throw. */
const poison = System.create({ name: "gpuTest/poison", components: { read: [position] } }, (row, { commands }) => {
    if (row[position][0] === 2) commands.despawn(row.entity);
    if (row[position][0] === 4) commands.add(row.entity, score, Symbol("poison") as unknown as number);
});

let frameNumber = 0;
const spawnedNow: Entity[] = [];

/** Spawns a few particles each frame, through growth of their archetypes; nothing on the CPU reads their positions. */
const spawnFew = System.create({ name: "gpuTest/churn" }, ({ commands }) => {
    for (let i = 0; i < 37; i++) spawnedNow.push(commands.spawn([position, velocity])({ [position]: [frameNumber, i, 0], [velocity]: [1, i % 3, 0.25] }));
    // Every fifth frame, a despawn moves another particle into a row the GPU wrote.
    if (frameNumber % 5 === 4) commands.despawn(spawnedNow[frameNumber * 3]);
});

/** A render body that fails after starting its pass. */
const fail = System.render({ name: "gpuTest/fail", shader: { accessors: { place: position } }, after: [move] }, ({ encoder }) => {
    encoder.beginComputePass();
    throw new Error("draw failed");
});

const failing = System.composite({ name: "gpuTest/failing", systems: [move, fail] });

/** Math from three namespaces, inlined into a compute shader. */
const transform = System.create({ name: "gpuTest/transform", kernel: "gpu", components: { read: [velocity], write: [position] } }, row => {
    const q = Quat.fromAxisAngle([0, 1, 0], 0.5);
    const m = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));
    row[position] = Vec3.add(Mat4x4.multiplyVec3(m, Quat.rotateVec3(q, row[position])), Vec3.normalize(row[velocity]));
});

const bitsTraits = Component.register(bits, { type: Vec3.U32.schema });
const sumsTraits = Component.register(sums, { type: Vec3.I32.schema });

const spawnIntegers = System.create({ name: "gpuTest/spawnIntegers" }, ({ commands }) => {
    for (let i = 0; i < 100; i++) {
        commands.spawn([bits, sums])({ [bits]: [Math.imul(i + 1, 0x9E3779B9) >>> 0, (0xFFFFFFFF - i) >>> 0, (i << 26) >>> 0], [sums]: [2 ** 31 - 1 - i, -(2 ** 31) + i, Math.imul(i, 65536)] });
    }
});

/** Integer builtins, which wrap and count bits as the functions do. */
const integers = System.create({ name: "gpuTest/integers", kernel: "gpu", components: { write: [bits, sums] } }, row => {
    const b = row[bits];
    const s = row[sums];
    row[bits] = Vec3.U32.add(Vec3.U32.countOneBits(b), Vec3.U32.add(Vec3.U32.countTrailingZeros(b), Vec3.U32.multiply(Vec3.U32.reverseBits(b), Vec3.U32.bitwiseXor(b, [7, 7, 7]))));
    row[sums] = Vec3.I32.add(Vec3.I32.multiply(s, [65536, 3, 65536]), Vec3.I32.abs(Vec3.I32.negate(s)));
});

/** Float builtins across vectors, quaternions and matrices, on in-domain inputs. */
const shading = System.create({ name: "gpuTest/shading", kernel: "gpu", components: { read: [velocity], write: [position] } }, row => {
    const p = row[position];
    const v = Vec3.add(row[velocity], [0.25, 0.5, 0.75]);
    const n = Vec3.normalize(v);
    const lit = Vec3.smoothstep([0, 0, 0], [4, 4, 4], Vec3.abs(p));
    const bent = Vec3.add(Vec3.reflect(n, [0, 1, 0]), Vec3.faceforward(n, [1, 0, 0], [0, 0, 1]));
    const mixed = Vec3.mix(Vec3.round(Vec3.scale(p, 0.5)), Vec3.fract(p), 0.25);
    const clamped = Vec3.clamp(Vec3.add(Vec3.min(p, v), Vec3.max(p, v)), [-2, -2, -2], [2, 2, 2]);
    const m = Mat4x4.transpose(Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.rotationY(0.5)));
    const [x, y, z] = Mat4x4.multiplyVec4(m, [p[0], p[1], p[2], 1]);
    const q = Quat.normalize([v[0], v[1], v[2], 1]);
    const weight = Vec3.distance(p, v) * 0.01 + Vec3.length(lit) + Quat.dot(q, q) + Mat4x4.determinant(m) + Vec3.step([0, 0, 0], p)[0];
    row[position] = Vec3.add(Vec3.add(Vec3.add(lit, bent), Vec3.add(mixed, clamped)), Vec3.scale([x, y, z], weight));
});

/** Reads the entity, an f64. */
const entityScore = System.create({ name: "gpuTest/entityScore", kernel: "gpu", components: { write: [score] } }, row => {
    row[score] = row.entity;
});

let watched = 0;
const watch = System.create({ name: "gpuTest/watch", components: { changed: [position] } }, () => { watched++; });

const frame = System.composite({ name: "gpuTest/frame", systems: [move, reset, moveAgain] });

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const positions = async (world: ReturnType<typeof createWorld>): Promise<Vec3[]> =>
    (await readEach(world, await select(world, { required: [position] }), position)).map(value => value ?? [NaN, NaN, NaN]);

let nextDevice: GPUDevice | null = null;
const setDevice = System.create({ name: "gpuTest/setDevice", resources: { write: [gpuDevice] } }, ({ resources }) => { resources[gpuDevice] = nextDevice; });

describe("the gpuDevice resource", () => {
    it("moves GPU kernels onto the device once a system sets it", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(move);
        // On the CPU, reads see the write at once.
        const moved = (await positions(world))[0];
        nextDevice = await device();
        await world.run(setDevice);
        await world.run(move);
        // On the GPU, observers read back its write before giving values.
        expect((await positions(world))[0]).not.toEqual(moved);
        await world.dispose();
    });

    it("sets itself to null once the device is lost, so the world goes on without it until a new one is set", async () => {
        const lost = await device();
        const world = createWorld({ [workers]: 0, [gpuDevice]: lost });
        const cpuWorld = createWorld({ [workers]: 0 });
        let changes = 0;
        const watchDevice = System.create({ name: "gpuTest/watchDevice", resources: { read: [gpuDevice], changed: [gpuDevice] } }, ({ resources }) => {
            void resources[gpuDevice];
            changes++;
        });
        let drawn = 0;
        const draw = System.render({ name: "gpuTest/drawWhileLost", shader: { accessors: { place: position } } }, () => { drawn++; });
        for (const each of [world, cpuWorld]) await each.run(spawn);
        await world.run(watchDevice);
        // This move stays on the lost device, so it's lost with it.
        await world.run(move);
        lost.destroy();
        await lost.lost;
        // Nothing fails: the move runs on the CPU from the CPU's copies, and the render system is skipped.
        await world.run(move);
        await world.run(draw);
        expect(drawn).toBe(0);
        expect(await readResource(world, gpuDevice)).toBeNull();
        await world.run(watchDevice);
        expect(changes).toBe(2);
        nextDevice = await device();
        await world.run(setDevice);
        await world.run(move);
        await world.run(draw);
        expect(drawn).toBe(1);
        for (let i = 0; i < 2; i++) await cpuWorld.run(move);
        expect(await positions(world)).toEqual(await positions(cpuWorld));
        await world.dispose();
        await cpuWorld.dispose();
    });

    it("moves to another device, reading back what's ahead on the one it leaves", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const each of [world, cpuWorld]) await each.run(spawn);
        await world.run(move);
        nextDevice = await device();
        await world.run(setDevice);
        await world.run(move);
        for (let i = 0; i < 2; i++) await cpuWorld.run(move);
        expect(await positions(world)).toEqual(await positions(cpuWorld));
        await world.dispose();
        await cpuWorld.dispose();
    });

    it("runs GPU kernels on the CPU again when set to null, and skips render systems", async () => {
        const world = createWorld({ [workers]: 2, [gpuDevice]: await device() }, { minimumChunk: 1 });
        const cpuWorld = createWorld({ [workers]: 0 });
        let drawn = 0;
        const draw = System.render({ name: "gpuTest/drawUntilNull", shader: { accessors: { place: position } } }, () => { drawn++; });
        for (const each of [world, cpuWorld]) await each.run(spawn);
        await world.run(draw);
        await world.run(move);
        nextDevice = null;
        await world.run(setDevice);
        await world.run(move);
        for (let i = 0; i < 2; i++) await cpuWorld.run(move);
        // On the CPU, reads see writes at once.
        expect(await positions(world)).toEqual(await positions(cpuWorld));
        await world.run(draw);
        expect(drawn).toBe(1);
        await world.dispose();
        await cpuWorld.dispose();
    });
});

describe("GPU kernels", () => {
    // Each comparison runs the same GPU kernels in a world without a GPU, where they run on the CPU.
    it("write values that observers see, as the CPU kernel's do", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            for (let i = 0; i < 3; i++) await world.run(move);
        }
        // Observers read back what the GPU wrote before giving values.
        expect((await positions(gpuWorld))[0]).not.toEqual([0, 0, -0]);
        expect(await positions(gpuWorld)).toEqual(await positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("see main-thread writes made between them in the same run, and the main thread sees theirs", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            await world.run(frame);
            await world.run(frame);
        }
        expect(await positions(gpuWorld)).toEqual(await positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("see main-thread writes to what they only read, made between them in the same run", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            await world.run(turning);
        }
        expect(await positions(gpuWorld)).toEqual(await positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("keep their writes when the sync point moves rows of their archetypes", async () => {
        const spawnOne = System.create({ name: "gpuTest/spawnOne" }, ({ commands }) => {
            commands.spawn([position, velocity])({ [position]: [-1, -1, -1], [velocity]: [0, 0, 0] });
        });
        const world = createWorld({ [gpuDevice]: await device() });
        await world.run(spawn);
        await world.run(move);
        await world.run(spawnOne);
        await world.run(move);
        const all = await positions(world);
        expect(all.length).toBe(count + 1);
        expect(all.filter(([x]) => x === -1)).toEqual([[-1, -1, -1]]);
        // Moved twice: once before the spawn's sync point and once after.
        expect(all.filter(([x]) => x === 2)).toEqual([[2, 0, 1]]);
        await world.dispose();
    });

    it("keep their writes when a cascade moves rows of their archetypes", async () => {
        const owners: Entity[] = [];
        const spawnOwned = System.create({ name: "gpuTest/spawnOwned" }, ({ commands }) => {
            owners.push(commands.spawn([score])({ [score]: 0 }), commands.spawn([score])({ [score]: 1 }));
            for (let i = 0; i < 64; i++) commands.spawn([position, velocity, ownedBy])({ [position]: [i, 0, 0], [velocity]: [1, 0, 0], [ownedBy]: owners[i === 0 ? 0 : 1] });
        });
        // No command touches the owned rows: despawning their owner removes them.
        const despawnOwner = System.create({ name: "gpuTest/despawnOwner" }, ({ commands }) => {
            const [owner] = owners;
            if (owner !== undefined) commands.despawn(owner);
        });
        const world = createWorld({ [gpuDevice]: await device() });
        await world.run(spawnOwned);
        await world.run(move);
        await world.run(despawnOwner);
        const xs = (await positions(world)).map(([x]) => x).sort((a, b) => a - b);
        expect(xs).toEqual(Array.from({ length: 63 }, (_, i) => i + 2));
        await world.dispose();
    });

    it("keep JS semantics for u32 values, bitwise operators and infinities", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        const values = async (world: ReturnType<typeof createWorld>): Promise<unknown[]> =>
            Promise.all((await select(world, { required: [code] })).map(entity => readEntity(world, entity, [code, amount])));
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawnNumbers);
            await world.run(numbers);
        }
        expect(await values(gpuWorld)).toEqual(await values(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("are read back for CPU systems that look them up", async () => {
        const world = createWorld({ [gpuDevice]: await device() });
        await world.run(spawnFollower);
        await world.run(following);
        await world.run(following);
        const [follower] = await select(world, { required: [followed] });
        expect(await read(world, follower, score)).toBe(20);
        await world.dispose();
    });

    it("keep their copies current when a sync point fails partway", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            await world.run(move);
            await expect(world.run(poison)).rejects.toThrow();
            await world.run(move);
        }
        expect(await positions(gpuWorld)).toEqual(await positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("keep their writes as spawns grow their archetypes and despawns move rows", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            spawnedNow.length = 0;
            for (frameNumber = 0; frameNumber < 40; frameNumber++) {
                await world.run(spawnFew);
                await world.run(move);
            }
        }
        expect((await positions(gpuWorld)).length).toBe((await positions(cpuWorld)).length);
        expect(await positions(gpuWorld)).toEqual(await positions(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("pass change filters on what they write, once per write", async () => {
        const counts: number[][] = [];
        for (const world of [createWorld({ [gpuDevice]: await device() }), createWorld({ [workers]: 0 })]) {
            watched = 0;
            const seen: number[] = [];
            await world.run(spawn);
            for (const system of [watch, watch, move, watch, watch, move, move, watch]) {
                await world.run(system);
                seen.push(watched);
            }
            counts.push(seen);
            await world.dispose();
        }
        expect(counts[0]).toEqual(counts[1]);
        expect(counts[0]).toEqual([count, count, count, 2 * count, 2 * count, 2 * count, 2 * count, 3 * count]);
    });

    it("inline math functions as the CPU does, at f32 precision", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            await world.run(transform);
        }
        const onGpu = (await positions(gpuWorld)).flat();
        const cpu = (await positions(cpuWorld)).flat();
        expect(onGpu.length).toBe(cpu.length);
        const worst = Math.max(...onGpu.map((value, i) => Math.abs(value - cpu[i]) / Math.max(1, Math.abs(cpu[i]))));
        expect(worst).toBeLessThan(1e-5);
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("emit WGSL builtins for integer math, which wraps and counts bits as the CPU does", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawnIntegers);
            await world.run(integers);
        }
        const values = async (world: ReturnType<typeof createWorld>): Promise<unknown[]> =>
            Promise.all((await select(world, { required: [bits] })).map(entity => readEntity(world, entity, [bits, sums])));
        expect(await values(gpuWorld)).toEqual(await values(cpuWorld));
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("emit WGSL builtins for float math, within f32 precision of the CPU", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
            await world.run(shading);
        }
        const onGpu = (await positions(gpuWorld)).flat();
        const cpu = (await positions(cpuWorld)).flat();
        expect(onGpu.length).toBe(cpu.length);
        const worst = Math.max(...onGpu.map((value, i) => Math.abs(value - cpu[i]) / Math.max(1, Math.abs(cpu[i]))));
        expect(worst).toBeLessThan(1e-4);
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });

    it("refuse what they can't run, with the reason", async () => {
        const world = createWorld({ [gpuDevice]: await device() });
        await expect(world.run(entityScore)).rejects.toThrow(/can't run on the GPU: it reads an f64 value/);
        await expect(world.run(flagScore)).rejects.toThrow(/reads a byte value/);
        // In a world without a GPU too: the declaration can never hold.
        const cpuWorld = createWorld({ [workers]: 0 });
        await expect(cpuWorld.run(flagScore)).rejects.toThrow(/reads a byte value/);
        await cpuWorld.dispose();
        await world.dispose();
    });
});

describe("render systems", () => {
    it("that fail lose only their own work", async () => {
        const world = createWorld({ [gpuDevice]: await device() });
        await world.run(spawn);
        expect((await world.run(failing)).failures.map(failure => failure.message)).toEqual(["draw failed"]);
        expect((await positions(world))[0]).toEqual([1, 0, 0.5]);
        await world.dispose();
    });

    it("that record invalid work make the next run report the GPU's error, under the run that submitted it", async () => {
        // A dispatch without a pipeline is a validation error when the encoder finishes.
        const invalid = System.render({ name: "gpuTest/invalid", shader: { accessors: { place: position } } }, ({ encoder }) => {
            const pass = encoder.beginComputePass();
            pass.dispatchWorkgroups(1);
            pass.end();
        });
        const own = await device();
        const world = createWorld({ [gpuDevice]: own });
        await world.run(spawn);
        await world.run(invalid);
        // The device reports the error once it has processed the run's work.
        await own.queue.onSubmittedWorkDone();
        const [failure] = (await world.run(spawn)).failures;
        expect([failure.kind, failure.name]).toEqual(["gpu", "gpuTest/invalid"]);
        expect(failure.message).toMatch(/^validation: /);
        expect((await world.run(spawn)).failures).toEqual([]);
        await world.dispose();
    });

    it("name accessors anything WGSL allows, and only that", async () => {
        const own = await device();
        const named = (name: "gpuTest/count" | "gpuTest/target", accessor: string) => System.render({ name, shader: { accessors: { [accessor]: position } } }, () => {});
        const module = own.createShaderModule({ code: `${Gpu.wgsl(named("gpuTest/count", "count"))}\n@compute @workgroup_size(1) fn main() { _ = count(0u); }` });
        expect((await module.getCompilationInfo()).messages.filter(message => message.type === "error")).toEqual([]);
        expect(() => Gpu.wgsl(named("gpuTest/target", "target"))).toThrow(/isn't usable as a WGSL function name/);
    });

    it("read their components on the GPU through the generated accessors", async () => {
        const own = await device();
        const output = own.createBuffer({ size: count * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const copy = System.render({
            name: "gpuTest/copy/2",
            components: { has: [tag] },
            shader: { group: 0, accessors: { place: position } },
            after: [move],
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
        const world = createWorld({ [gpuDevice]: own });
        const outputLayout = own.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }] });
        const outputGroup = own.createBindGroup({ layout: outputLayout, entries: [{ binding: 0, resource: { buffer: output } }] });
        const module = own.createShaderModule({
            code: `${Gpu.wgsl(copy)}
@group(1) @binding(0) var<storage, read_write> output: array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ecs_count()) { return; }
    output[id.x] = vec4f(place(id.x), 1.0);
}`,
        });
        const pipeline = own.createComputePipeline({ layout: own.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(own), outputLayout] }), compute: { module, entryPoint: "main" } });
        const frameWithCopy = System.composite({ name: "gpuTest/frame/2", systems: [move, copy] });
        await world.run(spawn);
        await world.run(frameWithCopy);
        const staging = own.createBuffer({ size: output.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const encoder = own.createCommandEncoder();
        encoder.copyBufferToBuffer(output, 0, staging, 0, output.size);
        own.queue.submit([encoder.finish()]);
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
