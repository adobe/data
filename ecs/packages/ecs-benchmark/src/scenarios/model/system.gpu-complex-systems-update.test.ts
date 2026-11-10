// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import {
    complexSystemsUpdate, createGpuMixedUpdateEntities, createGpuUpdateEntities, createMixedUpdateEntities, createUpdateEntities, gpuComplexSystemsUpdate,
    gpuSystemsUpdate, systemsUpdate,
} from "./index.js";
import { gpuData } from "./gpu/component.gpu-data.js";
import { data } from "./shared/component.data.js";
import { damage } from "./shared/component.damage.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { frameBuffer } from "./shared/resource.frame-buffer.js";

/** Each entity's values, in the order its world made them, data's `dingy` apart; and the frame buffer. */
const stateOf = async (world: World, entities: readonly Entity[]) => {
    const rows = new Map<Entity, { [value: string]: unknown }>();
    const row = (entity: Entity) => rows.get(entity) ?? rows.set(entity, {}).get(entity) ?? {};
    const copy = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
    for (const [name, key] of [["position", position], ["velocity", velocity], ["player", player], ["health", health], ["damage", damage], ["sprite", sprite]] as const) {
        await world.run(System.create({ readonly: true, components: { with: [key] } }, values => { row(values.entity)[name] = copy(values[key]); }));
    }
    const dingies = new Map<Entity, number>();
    await world.run(System.create({ readonly: true, components: { with: [data] } }, values => {
        const { dingy, ...rest } = values[data];
        row(values.entity)["data"] = copy(rest);
        dingies.set(values.entity, dingy);
    }));
    await world.run(System.create({ readonly: true, components: { with: [gpuData] } }, values => {
        const { dingy, ...rest } = values[gpuData];
        row(values.entity)["data"] = copy(rest);
        dingies.set(values.entity, dingy);
    }));
    const frame = await world.run(System.create({ readonly: true }, ({ resources }) => [...resources[frameBuffer]]));
    return { rows: entities.map(entity => rows.get(entity)), dingies: entities.map(entity => dingies.get(entity) ?? NaN), frame };
};

describe("the GPU lane's frames", () => {
    for (const [label, create, createGpu] of [["uniform", createUpdateEntities, createGpuUpdateEntities], ["mixed", createMixedUpdateEntities, createGpuMixedUpdateEntities]] as const) {
        for (const [systems, frame, gpuFrame] of [[2, systemsUpdate, gpuSystemsUpdate], [7, complexSystemsUpdate, gpuComplexSystemsUpdate]] as const) {
            it(`compute on the CPU what the suite's ${systems} systems do over ${label} entities, data's dingy to an f32's precision`, async () => {
                const run = async (setup: typeof create, each: System) => {
                    const world = World.create({ [workers]: 0 });
                    const entities = await world.run(setup, { count: 2000 });
                    for (let i = 0; i < 25; i++) await world.run(each);
                    const state = await stateOf(world, entities);
                    await world.dispose();
                    return state;
                };
                const [cpu, gpu] = await Promise.all([run(create, frame), run(createGpu, gpuFrame)]);
                expect(gpu.rows).toEqual(cpu.rows);
                expect(gpu.frame).toEqual(cpu.frame);
                // Entities without data have no dingy on either.
                expect(gpu.dingies.map(Number.isNaN)).toEqual(cpu.dingies.map(Number.isNaN));
                gpu.dingies.forEach((dingy, k) => {
                    if (!Number.isNaN(dingy)) expect(Math.abs(dingy - (cpu.dingies[k] ?? NaN))).toBeLessThan(1e-6);
                });
            });
        }
    }
});
