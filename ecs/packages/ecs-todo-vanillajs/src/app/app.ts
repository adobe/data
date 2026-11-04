// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, World, workers } from "@adobe/ecs";
import { completionPlugin, completionResources } from "../features/completion/view/index.js";
import { filterPlugin, filterResources } from "../features/filter/view/index.js";
import { generatePlugin } from "../features/generate/view/index.js";
import { todosPlugin, todosResources } from "../features/todos/view/index.js";

export type App = { readonly world: World; readonly dispose: () => Promise<void> };

/**
 * Starts the app on the page within `root`: a world holding the fixed elements its features find there, with the
 * features' plugins, which define their elements, add their DOM systems and start runs for the page's events.
 */
export const createApp = (root: HTMLElement): App => {
    const world = World.create({ [workers]: 0, ...todosResources(root), ...filterResources(root), ...completionResources(root) });
    const plugins = Plugin.start(world, [todosPlugin, filterPlugin, completionPlugin, generatePlugin], { root });
    return {
        world,
        dispose: async () => {
            plugins[Symbol.dispose]();
            await world.dispose();
        },
    };
};
