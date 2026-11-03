// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoFilters } from "../elements/index.js";
import { setFilter, systems as model } from "../model/index.js";
import { define, on } from "../../page/view/index.js";
import { systems } from "./constant.systems.js";

/** Filtering on the page within `root`: its buttons choose which todos the list shows. */
export const filterPlugin: Plugin<"root"> = {
    systems: [...model, ...systems],
    connect: (world, { root }) => {
        define({ "todo-filters": TodoFilters });
        return on(root, "todo-filter", event => void world.run(setFilter, { filter: event.detail.filter }));
    },
};

declare module "@adobe/ecs" {
    interface PluginConfig {
        /** The page's element holding the app's markup, whose events the plugins listen for. */
        root: HTMLElement;
    }
}
