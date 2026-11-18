// © 2026 Adobe. MIT License. See /LICENSE for details.
import { playerType } from "./internal/constant.player-type.js";
import { addHeroMonster } from "./internal/function.add-hero-monster.js";
import { create } from "./internal/function.create.js";
import type { Reference } from "./type.reference.js";

/** `BM_SystemsUpdateMixedEntities`'s entities. */
export const mixedUpdateEntities = (count: number, seedOf: (i: number) => number): Reference[] => {
    const entities: Reference[] = [];
    for (let i = 0, j = 0; i < count; i++) {
        const entity = create();
        entities.push(entity);
        if (count < 100 || (i >= Math.floor(2 * count / 4) && i <= Math.floor(3 * count / 4))) {
            if (count < 100 || j % 10 === 0) {
                if (i % 7 === 0) delete entity.position;
                if (i % 11 === 0) delete entity.velocity;
                if (i % 13 === 0) delete entity.data;
            }
            j++;
        }
    }
    for (let i = 0, j = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity === undefined) continue;
        if ((count < 100 && i === 0) || count >= 100 || i >= Math.floor(count / 8)) {
            if ((count < 100 && i === 0) || count >= 100 || j % 2 === 0) {
                if (i === 0) addHeroMonster(entity, seedOf(i), playerType.hero);
                else if (i % 6 === 0) addHeroMonster(entity, seedOf(i), null);
                else if (i % 4 === 0) addHeroMonster(entity, seedOf(i), playerType.hero);
                else if (i % 2 === 0) addHeroMonster(entity, seedOf(i), playerType.monster);
            }
            j++;
        }
    }
    return entities;
};
