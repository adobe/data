// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { playerType } from "./constant.player-type.js";
import { heroMonsterValues } from "./function.hero-monster-values.js";
import { playerSeed } from "./function.player-seed.js";
import { seedRandom } from "./function.seed-random.js";
import type { HeroMonsterValues } from "./type.hero-monster-values.js";

/**
 * `createEntitiesWithMixedComponents`'s loop over `count` entities, through a lane's spawners: it removes components
 * one, two and three from some in the middle, then makes heroes and monsters of some, as its loop picks them. It
 * returns them in order.
 */
export const mixedEntities = (count: number, lane: {
    readonly create: () => Entity;
    readonly createHeroMonster: (values: HeroMonsterValues) => Entity;
    readonly removeOne: (entity: Entity) => void;
    readonly removeTwo: (entity: Entity) => void;
    readonly removeThree: (entity: Entity) => void;
}): Entity[] => {
    const entities: Entity[] = [];
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
            entity = lane.create();
            if (removeOne) lane.removeOne(entity);
        }
        else {
            // addComponents adds component one back where it was removed, and initComponents places it.
            entity = lane.createHeroMonster(heroMonsterValues(seedRandom(playerSeed(i)), type));
        }
        if (removeTwo) lane.removeTwo(entity);
        if (removeThree) lane.removeThree(entity);
        entities.push(entity);
    }
    return entities;
};
