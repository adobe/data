// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { damage, data, defaultVelocity, health, heroMonsterValues, player, playerSeed, position, seedRandom, sprite, velocity } from "../../../model/index.js";
import { HeroMonster } from "./internal/archetype.hero-monster.js";
import { defaultData } from "./internal/constant.default-data.js";

/**
 * `BM_SystemsUpdate`'s entities: `count` made by `create`, each given a random hero or monster by `addComponents` and
 * `initComponents`. It returns them in order.
 */
export const createUpdateEntities: System<{ readonly count: number }, readonly Entity[]> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const entities: Entity[] = [];
    const create = commands.spawn(HeroMonster, { [velocity]: defaultVelocity, [data]: defaultData });
    for (let i = 0; i < input.count; i++) {
        const values = heroMonsterValues(seedRandom(playerSeed(i)), null);
        entities.push(create({ [position]: values.position, [player]: values.player, [health]: values.health, [damage]: values.damage, [sprite]: values.sprite }));
    }
    return entities;
});
