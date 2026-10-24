// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { Gpu } from "../../interface/gpu/gpu.js";
import { Index } from "../../interface/indexes/index-type.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { runReported } from "./reports.test-helper.js";
import type { F32, U32, Vec3 } from "../../interface/math/index.js";

const depth = Symbol("renderOrderTest/depth");
const code = Symbol("renderOrderTest/code");
const shape = Symbol("renderOrderTest/shape");
const image = Symbol("renderOrderTest/image");
const size = Symbol("renderOrderTest/size");
const visible = Symbol("renderOrderTest/visible");
const hidden = Symbol("renderOrderTest/hidden");

declare module "@adobe/ecs" {
    export interface Components {
        [depth]: { type: F32 };
        [code]: { type: U32 };
        [shape]: { type: true };
        [image]: { type: true };
        [size]: { type: Vec3 };
        [visible]: { type: true };
        [hidden]: { type: true };
    }
}


const byDepth = Index.create({ key: [depth], sorted: true });

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

const count = 2000;
const spawned: Entity[] = [];

/**
 * Shapes and images interleaved in depth, spawned in reverse depth order, so neither spawn nor row order is paint
 * order. Every tenth is hidden or not visible, which the render system filters out, and plain depths match nothing.
 */
const spawn = System.create({}, ({ commands }) => {
    for (let i = count - 1; i >= 0; i--) {
        if (i % 10 === 3) spawned[i] = commands.spawn([depth, code, shape, visible, hidden])({ [depth]: i, [code]: i, [shape]: true, [visible]: true, [hidden]: true });
        else if (i % 10 === 7) spawned[i] = commands.spawn([depth, code, image])({ [depth]: i, [code]: i, [image]: true });
        else if (i % 2 === 0) spawned[i] = commands.spawn([depth, code, shape, visible])({ [depth]: i, [code]: i, [shape]: true, [visible]: true });
        else spawned[i] = commands.spawn([depth, code, image, size, visible])({ [depth]: i, [code]: i, [image]: true, [size]: [i, i, i], [visible]: true });
    }
    commands.spawn([depth])({ [depth]: -1 });
});

/** The codes a frame should draw, in paint order. */
const drawn = (codes: Iterable<number>): number[] => [...codes].filter(i => i % 10 !== 3 && i % 10 !== 7).sort((a, b) => a - b);

describe("render systems with an order", () => {
    it("draw every matching archetype as one table, in the index's order, through the same accessors", async () => {
        const own = await device();
        const output = own.createBuffer({ size: (count + 16) * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
        const tableCounts: number[][] = [];
        const draw = System.render({
            components: { with: [visible], not: [hidden] },
            order: byDepth,
            shader: { accessors: { paintDepth: depth, paintCode: code } },
        }, ({ encoder, tables }) => {
            tableCounts.push(tables.map(table => table.count));
            encoder.clearBuffer(output);
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(1, outputGroup);
            for (const table of tables) {
                table.bind(pass);
                pass.dispatchWorkgroups(Math.ceil(table.count / 64));
            }
            pass.end();
        });
        const outputLayout = own.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }] });
        const outputGroup = own.createBindGroup({ layout: outputLayout, entries: [{ binding: 0, resource: { buffer: output } }] });
        const module = own.createShaderModule({
            code: `${Gpu.wgsl(draw)}
@group(1) @binding(0) var<storage, read_write> output: array<vec2u>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ecs_count()) { return; }
    output[id.x] = vec2u(u32(paintDepth(id.x)), paintCode(id.x));
}`,
        });
        expect((await module.getCompilationInfo()).messages.filter(message => message.type === "error")).toEqual([]);
        const pipeline = own.createComputePipeline({ layout: own.createPipelineLayout({ bindGroupLayouts: [Gpu.layout(own), outputLayout] }), compute: { module, entryPoint: "main" } });

        /** What the last frame drew: depth and code per instance. */
        const read = async (): Promise<number[][]> => {
            const staging = own.createBuffer({ size: output.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            const encoder = own.createCommandEncoder();
            encoder.copyBufferToBuffer(output, 0, staging, 0, output.size);
            own.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const words = new Uint32Array(staging.getMappedRange().slice(0));
            staging.destroy();
            const instances = tableCounts.at(-1)?.[0] ?? 0;
            return Array.from({ length: instances }, (_, i) => [words[2 * i], words[2 * i + 1]]);
        };
        const frame = async (): Promise<void> => expect((await runReported(world, draw)).failures).toEqual([]);

        const world = createWorld({ [gpuDevice]: own });
        await world.run(spawn);
        await frame();
        const codes = new Set(Array.from({ length: count }, (_, i) => i));
        let expected = drawn(codes);
        expect(tableCounts.at(-1)).toEqual([expected.length]);
        expect(await read()).toEqual(expected.map(i => [i, i]));

        // A despawn moves another shape into its row, a spawn adds an image between two others, and a key moves a shape
        // to the back; a frame after each draws the new order.
        const despawn = System.create({}, ({ commands }) => commands.despawn(spawned[count - 2]));
        await world.run(despawn);
        codes.delete(count - 2);
        await frame();
        expected = drawn(codes);
        expect(await read()).toEqual(expected.map(i => [i, i]));

        const addImage = System.create({}, ({ commands }) => {
            commands.spawn([depth, code, image, size, visible])({ [depth]: 500.5, [code]: 5001, [image]: true, [size]: [0, 0, 0], [visible]: true });
        });
        await world.run(addImage);
        await frame();
        const withImage = expected.flatMap(i => i === 500 ? [[i, i], [500, 5001]] : [[i, i]]);
        expect(await read()).toEqual(withImage);

        const toBack = System.create({ components: { with: [code, depth] } }, row => {
            if (row[code] === 10) row[depth] = count + 5;
        });
        await world.run(toBack);
        await frame();
        const atBack = [...withImage.filter(([, c]) => c !== 10), [count + 5, 10]];
        expect(await read()).toEqual(atBack);

        // Showing a hidden shape adds it to the one table, in its place.
        const show = System.create({}, ({ commands }) => commands.remove(spawned[13], hidden));
        await world.run(show);
        await frame();
        const shown = atBack.flatMap(([d, c]) => d === 12 ? [[d, c], [13, 13]] : [[d, c]]);
        expect(await read()).toEqual(shown);
        expect(tableCounts.every(counts => counts.length === 1)).toBe(true);
        await world.dispose();
    });

    it("write their order only when the index's entries change or move", async () => {
        const own = await device();
        const draw = System.render({ components: { with: [visible], not: [hidden] }, order: byDepth, shader: { accessors: { paintDepth: depth } } }, () => {});
        const world = createWorld({ [gpuDevice]: own });
        await world.run(spawn);
        await world.run(draw);
        const instances = drawn(Array.from({ length: count }, (_, i) => i)).length;
        // Row uploads and block writes pass a size; record writes don't.
        const sizes: number[] = [];
        const { queue } = own;
        const write = queue.writeBuffer.bind(queue);
        let records = 0;
        queue.writeBuffer = (buffer, offset, data, dataOffset, size) => {
            if (size === undefined) records++;
            else sizes.push(size);
            write(buffer, offset, data, dataOffset, size);
        };
        await world.run(draw);
        expect([sizes, records]).toEqual([[], 0]);
        // A new key writes its chunk of the column and the order, in elements; the record stays.
        const toBack = System.create({ components: { with: [code, depth] } }, row => {
            if (row[code] === 10) row[depth] = count + 5;
        });
        await world.run(toBack);
        await world.run(draw);
        expect(sizes.slice(1)).toEqual([instances]);
        expect(records).toBe(0);
        sizes.length = 0;
        await world.run(draw);
        expect(sizes).toEqual([]);
        await world.dispose();
    });

    it("give a shader one table when nothing matches", async () => {
        const own = await device();
        let tables: readonly System.RenderTable[] = [];
        const draw = System.render({ components: { with: [hidden, image] }, order: byDepth, shader: { accessors: { paintDepth: depth } } }, context => { tables = context.tables; });
        const world = createWorld({ [gpuDevice]: own });
        await world.run(spawn);
        expect((await runReported(world, draw)).failures).toEqual([]);
        expect(tables.map(table => table.count)).toEqual([0]);
        await world.dispose();
    });

    it("declare their ordered accessors, which compile", async () => {
        const own = await device();
        const draw = System.render({ order: byDepth, shader: { group: 2, accessors: { paintDepth: depth, paintSize: size } } }, () => {});
        const code = Gpu.wgsl(draw);
        expect(code).toContain("fn paintDepth(row: u32) -> f32");
        expect(code).toContain("fn paintSize(row: u32) -> vec3<f32>");
        expect(code).toContain("@group(2) @binding(1) var<uniform> ecs_table: EcsTable;");
        // An instance is its position in the order, which the order block maps to a table and a row.
        expect(code).toContain("struct EcsTable { ecs_rows: u32, ecs_order: u32, ecs_tables: u32, ecs_shift: u32 }");
        const module = own.createShaderModule({ code: `${code}\n@compute @workgroup_size(1) fn main() { _ = paintDepth(0u); _ = paintSize(0u); _ = ecs_count(); }` });
        expect((await module.getCompilationInfo()).messages.filter(message => message.type === "error")).toEqual([]);
    });
});
