// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { Minimal } from "./shared/archetype.minimal.js";
import { position } from "./shared/component.position.js";
import { velocity } from "./shared/component.velocity.js";
import { defaultPosition } from "./shared/constant.default-position.js";
import { defaultVelocity } from "./shared/constant.default-velocity.js";

/** `BM_CreateEntities`: `createMinimal` `count` times. */
export const createEntities: System<{ readonly count: number }> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const createMinimal = commands.spawn(Minimal, { [position]: defaultPosition, [velocity]: defaultVelocity });
    for (let i = 0; i < input.count; i++) createMinimal();
});
