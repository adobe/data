// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { GpuHeroMonster } from "./gpu/archetype.gpu-hero-monster.js";
import { damage } from "./shared/component.damage.js";
import { gpuData } from "./gpu/component.gpu-data.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { defaultGpuData } from "./gpu/constant.default-gpu-data.js";
import { defaultVelocity } from "./shared/constant.default-velocity.js";
import { heroMonsterValues } from "./shared/function.hero-monster-values.js";
import { playerSeed } from "./shared/function.player-seed.js";
import { seedRandom } from "./shared/function.seed-random.js";

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
