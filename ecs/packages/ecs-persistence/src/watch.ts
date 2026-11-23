// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type World } from "@adobe/ecs";
import type { Failure } from "./failure.js";
import { programOf, type NamingTrait } from "./program/program.js";

/**
 * Calls `onChange` after each sync point at which a component or resource the trait `by` covers changed, on whichever
 * thread holds it: written, added to or removed from an entity, or held by an entity spawned or despawned; and once
 * after the first sync point, so a consumer saving snapshots saves the first. It's called on `world`'s thread after
 * the sync point's readonly systems, at most once each, so a burst of changes is one call; a consumer that saves
 * less often waits there. Returns the function that stops it. Fails, as data, for a trait it can't save by, or a
 * `world` joined from another thread, which can't see what other threads hold.
 */
export const watch = (input: { readonly world: World; readonly by: NamingTrait }, onChange: () => void): (() => void) | Failure => {
    const program = programOf(input.by);
    if (typeof program === "string") return { failure: program };
    const notice = System.create({ readonly: true, changed: [input.by] }, () => onChange());
    try {
        input.world.add(notice);
    }
    catch (error) {
        return { failure: error instanceof Error ? error.message : String(error) };
    }
    return () => input.world.remove(notice);
};
