// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data, defaultPosition, defaultVelocity, position, velocity } from "../../../model/index.js";
import { Full } from "./internal/archetype.full.js";
import { Minimal } from "./internal/archetype.minimal.js";
import { defaultData } from "./internal/constant.default-data.js";

/** `createEntitiesWithHalfComponents`: `create` for even `i`, `createMinimal` for odd. */
export const createHalfComponentEntities: System<{ readonly count: number }> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const create = commands.spawn(Full, { [position]: defaultPosition, [velocity]: defaultVelocity, [data]: defaultData });
    const createMinimal = commands.spawn(Minimal, { [position]: defaultPosition, [velocity]: defaultVelocity });
    for (let i = 0; i < input.count; i++) {
        if (i % 2 === 0) create();
        else createMinimal();
    }
});
