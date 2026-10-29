// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import type { Failure } from "./failure.js";
import { contents, type Contents } from "./program/contents.js";
import { programOf } from "./program/program.js";
import { select, type Selection } from "./selection/selection.js";

/** The persisted part of some of a world's entities and its persisted resources, which `encode` and `spawn` take. */
export type Snapshot = { readonly failure?: undefined; readonly [contents]: Contents };

/**
 * A snapshot of some of `world`'s entities, read on its thread: by default every entity holding a persisted
 * component, and the persisted resources; with `with` and `not`, those a query matches, and the resources unless
 * `resources` is false; with `root`, it and every entity it owns, through persisted owner references, without
 * resources. Fails, as data, when the program's persisted keys can't be saved or the world can't be read.
 */
export const snapshot = async (input: { readonly world: World } & Selection): Promise<Snapshot | Failure> => {
    const program = programOf();
    if (typeof program === "string") return { failure: program };
    const taken = await select(input.world, program, input);
    return "failure" in taken ? taken : { [contents]: taken };
};
