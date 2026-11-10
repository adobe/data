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
import { mixedEntities } from "./shared/function.mixed-entities.js";

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
