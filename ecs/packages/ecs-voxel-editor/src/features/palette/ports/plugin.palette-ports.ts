// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { setFavorites } from "../model/index.js";
import { favoritesKey } from "./plugin.palette-ports/constant.favorites-key.js";
import { storeFavorites } from "./plugin.palette-ports/system.store-favorites.js";

/** The user's favorites, kept in the browser's local storage: read as the plugin connects, and written as they change. */
export const palettePorts: Plugin = {
    systems: [storeFavorites],
    connect: world => {
        let keys: string[] = [];
        try {
            const kept: unknown = JSON.parse(localStorage.getItem(favoritesKey) ?? "[]");
            if (Array.isArray(kept)) keys = kept.filter((key): key is string => typeof key === "string");
        } catch {
            keys = [];
        }
        void world.run(setFavorites, { keys });
        return () => {};
    },
};
