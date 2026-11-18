// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { damage, defaultPosition, defaultVelocity, health, mixedEntities, player, position, sprite, velocity } from "../../../model/index.js";
import { gpuData } from "./component.gpu-data.js";
import { GpuHeroMonster } from "./internal/archetype.gpu-hero-monster.js";
import { defaultGpuData } from "./internal/constant.default-gpu-data.js";

/** `BM_SystemsUpdateMixedEntities`'s entities for the GPU lane, its data's `dingy` an f32, in order. */
export const createGpuMixedUpdateEntities: System<{ readonly count: number }, readonly Entity[]> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const create = commands.spawn(GpuFull, { [position]: defaultPosition, [velocity]: defaultVelocity, [gpuData]: defaultGpuData });
    const createHeroMonster = commands.spawn(GpuHeroMonster, { [velocity]: defaultVelocity, [gpuData]: defaultGpuData });
    return mixedEntities(input.count, {
        create,
        createHeroMonster: (values) => createHeroMonster({ [position]: values.position, [player]: values.player, [health]: values.health, [damage]: values.damage, [sprite]: values.sprite }),
        removeOne: (entity) => commands.remove(entity, position),
        removeTwo: (entity) => commands.remove(entity, velocity),
        removeThree: (entity) => commands.remove(entity, gpuData),
    });
});

/** `Full` with the GPU lane's data. */
const GpuFull = [position, velocity, gpuData] as const;
