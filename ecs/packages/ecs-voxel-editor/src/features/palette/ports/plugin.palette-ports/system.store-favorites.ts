// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { favorites } from "../../model/index.js";
import { favoritesKey } from "./constant.favorites-key.js";

/** Keeps the favorites in the browser's local storage, as they change. */
export const storeFavorites: System = System.create({
    readonly: true,
    resources: { changed: [favorites] },
}, ({ resources }) => {
    const kept = resources[favorites];
    if (kept !== null) localStorage.setItem(favoritesKey, JSON.stringify([...kept]));
});
