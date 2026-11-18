// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { damage, defaultVelocity, health, heroMonsterValues, player, playerSeed, position, seedRandom, sprite, velocity } from "../../../model/index.js";
import { gpuData } from "./component.gpu-data.js";
import { GpuHeroMonster } from "./internal/archetype.gpu-hero-monster.js";
import { defaultGpuData } from "./internal/constant.default-gpu-data.js";

/**
 * `createUpdateEntities` for the GPU lane, its data's `dingy` an f32: `BM_SystemsUpdate`'s entities, `count` made by `create`, each given a random hero or monster by `addComponents` and
 * `initComponents`. It returns them in order.
 */
export const createGpuUpdateEntities: System<{ readonly count: number }, readonly Entity[]> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const entities: Entity[] = [];
    const create = commands.spawn(GpuHeroMonster, { [velocity]: defaultVelocity, [gpuData]: defaultGpuData });
    for (let i = 0; i < input.count; i++) {
        const values = heroMonsterValues(seedRandom(playerSeed(i)), null);
        entities.push(create({ [position]: values.position, [player]: values.player, [health]: values.health, [damage]: values.damage, [sprite]: values.sprite }));
    }
    return entities;
});
