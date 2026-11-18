// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { damage, data, defaultPosition, defaultVelocity, health, mixedEntities, player, position, sprite, velocity } from "../../../model/index.js";
import { Full } from "./internal/archetype.full.js";
import { HeroMonster } from "./internal/archetype.hero-monster.js";
import { defaultData } from "./internal/constant.default-data.js";

/** `BM_SystemsUpdateMixedEntities`'s entities, `createEntitiesWithMixedComponents`'s, in order. */
export const createMixedUpdateEntities: System<{ readonly count: number }, readonly Entity[]> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const create = commands.spawn(Full, { [position]: defaultPosition, [velocity]: defaultVelocity, [data]: defaultData });
    const createHeroMonster = commands.spawn(HeroMonster, { [velocity]: defaultVelocity, [data]: defaultData });
    return mixedEntities(input.count, {
        create,
        createHeroMonster: (values) => createHeroMonster({ [position]: values.position, [player]: values.player, [health]: values.health, [damage]: values.damage, [sprite]: values.sprite }),
        removeOne: (entity) => commands.remove(entity, position),
        removeTwo: (entity) => commands.remove(entity, velocity),
        removeThree: (entity) => commands.remove(entity, data),
    });
});
