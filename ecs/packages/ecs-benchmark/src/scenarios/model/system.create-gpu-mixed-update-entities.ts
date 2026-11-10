// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { GpuFull } from "./gpu/archetype.gpu-full.js";
import { GpuHeroMonster } from "./gpu/archetype.gpu-hero-monster.js";
import { damage } from "./shared/component.damage.js";
import { gpuData } from "./gpu/component.gpu-data.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { defaultGpuData } from "./gpu/constant.default-gpu-data.js";
import { defaultPosition } from "./shared/constant.default-position.js";
import { defaultVelocity } from "./shared/constant.default-velocity.js";
import { playerType } from "./shared/constant.player-type.js";
import { heroMonsterValues } from "./shared/function.hero-monster-values.js";
import { playerSeed } from "./shared/function.player-seed.js";
import { seedRandom } from "./shared/function.seed-random.js";

/**
 * `createMixedUpdateEntities` for the GPU lane, its data's `dingy` an f32: `BM_SystemsUpdateMixedEntities`'s entities, `createEntitiesWithMixedComponents`, which removes components one, two
 * and three from some in the middle, then heroes and monsters added to some, as its loop picks them. It returns them in
 * order.
 */
export const createGpuMixedUpdateEntities: System<{ readonly count: number }, readonly Entity[]> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const { count } = input;
    const entities: Entity[] = [];
    const create = commands.spawn(GpuFull, { [position]: defaultPosition, [velocity]: defaultVelocity, [gpuData]: defaultGpuData });
    const createHeroMonster = commands.spawn(GpuHeroMonster, { [velocity]: defaultVelocity, [gpuData]: defaultGpuData });
    for (let i = 0, j = 0, k = 0; i < count; i++) {
        let removeOne = false;
        let removeTwo = false;
        let removeThree = false;
        if (count < 100 || (i >= Math.floor((2 * count) / 4) && i <= Math.floor((3 * count) / 4))) {
            if (count < 100 || j % 10 === 0) {
                removeOne = i % 7 === 0;
                removeTwo = i % 11 === 0;
                removeThree = i % 13 === 0;
            }
            j++;
        }
        // null for a random type, undefined for none.
        let type: number | null | undefined = undefined;
        if ((count < 100 && i === 0) || count >= 100 || i >= Math.floor(count / 8)) {
            if ((count < 100 && i === 0) || count >= 100 || k % 2 === 0) {
                if (i === 0) type = playerType.hero;
                else if (i % 6 === 0) type = null;
                else if (i % 4 === 0) type = playerType.hero;
                else if (i % 2 === 0) type = playerType.monster;
            }
            k++;
        }
        let entity: Entity;
        if (type === undefined) {
            entity = create();
            if (removeOne) commands.remove(entity, position);
        }
        else {
            // addComponents adds component one back where it was removed, and initComponents places it.
            const values = heroMonsterValues(seedRandom(playerSeed(i)), type);
            entity = createHeroMonster({ [position]: values.position, [player]: values.player, [health]: values.health, [damage]: values.damage, [sprite]: values.sprite });
        }
        if (removeTwo) commands.remove(entity, velocity);
        if (removeThree) commands.remove(entity, gpuData);
        entities.push(entity);
    }
    return entities;
});
