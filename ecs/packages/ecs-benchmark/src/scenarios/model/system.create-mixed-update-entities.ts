// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { Full } from "./shared/archetype.full.js";
import { HeroMonster } from "./shared/archetype.hero-monster.js";
import { damage } from "./shared/component.damage.js";
import { data } from "./shared/component.data.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { velocity } from "./shared/component.velocity.js";
import { defaultData } from "./shared/constant.default-data.js";
import { defaultPosition } from "./shared/constant.default-position.js";
import { defaultVelocity } from "./shared/constant.default-velocity.js";
import { mixedEntities } from "./shared/function.mixed-entities.js";

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
