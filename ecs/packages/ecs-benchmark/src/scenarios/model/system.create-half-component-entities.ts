// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { Full } from "./shared/archetype.full.js";
import { Minimal } from "./shared/archetype.minimal.js";
import { data } from "./shared/component.data.js";
import { position } from "./shared/component.position.js";
import { velocity } from "./shared/component.velocity.js";
import { defaultData } from "./shared/constant.default-data.js";
import { defaultPosition } from "./shared/constant.default-position.js";
import { defaultVelocity } from "./shared/constant.default-velocity.js";

/** `createEntitiesWithHalfComponents`: `create` for even `i`, `createMinimal` for odd. */
export const createHalfComponentEntities: System<{ readonly count: number }> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const create = commands.spawn(Full, { [position]: defaultPosition, [velocity]: defaultVelocity, [data]: defaultData });
    const createMinimal = commands.spawn(Minimal, { [position]: defaultPosition, [velocity]: defaultVelocity });
    for (let i = 0; i < input.count; i++) {
        if (i % 2 === 0) create();
        else createMinimal();
    }
});
