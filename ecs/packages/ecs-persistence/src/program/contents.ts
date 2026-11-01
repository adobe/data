// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Resource, World } from "@adobe/ecs";
import type { Persisted } from "./program.js";

/** Where a snapshot holds what it holds, a key only this package uses. */
export const contents: unique symbol = Symbol("snapshot contents");

/**
 * What a trait covers of some of a world's entities: of each archetype, its entities and a column of each component
 * the trait covers that it holds, keyed by this program's keys; and the values of the resources it covers.
 */
export type Contents = {
    /** The key of the trait it was taken or read by. */
    readonly by: symbol;
    /** Each component the trait covers that a table of it may hold. */
    readonly components: readonly Persisted<Component.Key>[];
    readonly tables: readonly World.Table[];
    readonly resources: readonly { readonly persisted: Persisted<Resource.Key>; readonly value: unknown }[];
};
