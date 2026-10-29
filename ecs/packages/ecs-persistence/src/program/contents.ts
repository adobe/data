// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Resource, World } from "@adobe/ecs";
import type { Persisted } from "./program.js";

/** Where a snapshot holds what it holds, a key only this package uses. */
export const contents: unique symbol = Symbol("snapshot contents");

/**
 * The persisted part of some of a world's entities: of each archetype, its entities and a column of each persisted
 * component it holds, keyed by this program's keys; and the values of persisted resources.
 */
export type Contents = {
    /** Each persisted component a table of it may hold. */
    readonly components: readonly Persisted<Component.Key>[];
    readonly tables: readonly World.Table[];
    readonly resources: readonly { readonly persisted: Persisted<Resource.Key>; readonly value: unknown }[];
};
