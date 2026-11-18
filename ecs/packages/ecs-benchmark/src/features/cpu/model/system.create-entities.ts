// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { defaultPosition, defaultVelocity, position, velocity } from "../../../model/index.js";
import { Minimal } from "./internal/archetype.minimal.js";

/** `BM_CreateEntities`: `createMinimal` `count` times. */
export const createEntities: System<{ readonly count: number }> = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const createMinimal = commands.spawn(Minimal, { [position]: defaultPosition, [velocity]: defaultVelocity });
    for (let i = 0; i < input.count; i++) createMinimal();
});
