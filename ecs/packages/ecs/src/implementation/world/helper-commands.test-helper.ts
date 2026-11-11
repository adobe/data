// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "../../interface/entity/entity.js";
import type { Commands } from "../../interface/system/commands.js";
import { color, size, tag } from "./helper-commands-keys.test-helper.js";

/** Helpers issuing commands for the kernels of `helper-commands.test.ts`, whose module doesn't import `tag`. */

/** A list of this module, which the kernels' module doesn't name. */
const look = [size, color, tag] as const;

/** Adds a list written in place with values written in place, returning nothing. */
export const dress = (commands: Commands, entity: Entity, shade: number): void => {
    commands.add(entity, [size, color, tag], { [size]: 2, [color]: shade, [tag]: true });
};

/** The values of `look`, keyed by its components. */
const values = (shade: number) => ({ [size]: 3, [color]: shade + 1, [tag]: true }) as const;

/** Adds this module's list with values a helper returns. */
export const dressReturned = (commands: Commands, entity: Entity, shade: number): void => {
    commands.add(entity, look, values(shade));
};

/** Adds this module's list with values a local holds, and returns early when there are none to give. */
export const dressLocal = (commands: Commands, entity: Entity, shade: number): void => {
    if (shade < 0) return;
    const given = { [size]: 1, [color]: shade * 2, [tag]: true };
    commands.add(entity, look, given);
};
