// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { favorites } from "./resource.favorites.js";

/** Sets the user's favorites, as their settings kept them. */
export const setFavorites: System<{ readonly keys: readonly string[] }> = System.create({}, ({ resources }, input: { readonly keys: readonly string[] }) => {
    resources[favorites] = new Set(input.keys);
});
