// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import type { Failure } from "./failure.js";
import { contents, type Contents } from "./program/contents.js";
import { programOf, type NamingTrait } from "./program/program.js";
import { select, type Selection } from "./selection/selection.js";

/**
 * What a trait covers of some of a world's entities and of its resources, which `encode` and `spawn` take, and the
 * trait it was taken or read by.
 */
export type Snapshot = { readonly failure?: undefined; readonly [contents]: Contents };

/**
 * A snapshot of some of `world`'s entities, read on its thread, by the trait `by`: a trait of the application's own,
 * whose value on a component's or resource's declaration is the name it's saved under. Of each entity it takes, it
 * takes the components the trait covers. By default it takes every entity holding one of them, and the resources the
 * trait covers; with `with` and `not`, those a query matches, and the resources unless `resources` is false; with
 * `where`, those of the archetypes holding its values of shared components, as a system's `where` of values keeps it to
 * them, read whole, so a snapshot of one value's entities costs what they hold, not the world; with `root`, it and every
 * entity it owns, through owner references the trait covers, without resources. Fails, as data, when `by` isn't a
 * symbol, what the trait covers can't be saved, `where` names what isn't a shared component or gives one a value not
 * of its type, or the world can't be read.
 */
export const snapshot = async (input: { readonly world: World; readonly by: NamingTrait } & Selection): Promise<Snapshot | Failure> => {
    const program = programOf(input.by);
    if (typeof program === "string") return { failure: program };
    const taken = await select(input.world, program, input);
    return "failure" in taken ? taken : { [contents]: taken };
};
