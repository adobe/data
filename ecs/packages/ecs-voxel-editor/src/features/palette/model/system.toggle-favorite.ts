// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { favorites } from "./resource.favorites.js";

/** Makes a palette item a favorite, or not, by its key. */
export const toggleFavorite: System<{ readonly key: string }> = System.create({}, ({ resources }, input: { readonly key: string }) => {
    const current = resources[favorites] ?? new Set<string>();
    resources[favorites] = current.has(input.key) ? new Set([...current].filter(key => key !== input.key)) : new Set([...current, input.key]);
});
