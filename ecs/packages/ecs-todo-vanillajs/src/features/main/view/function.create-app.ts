// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, World, workers } from "@adobe/ecs";
import { root } from "../../../view/index.js";
import { todosView } from "../../todos/view/index.js";
import type { App } from "./function.create-app/type.app.js";

/**
 * Starts the app on the page within `element`: a world holding it as the app's root, where each feature's view finds its
 * elements, with the todos' plugin, composing its sub-features', which define their elements, add their DOM systems and start runs for the
 * page's events there.
 */
export const createApp = (element: HTMLElement): App => {
    const world = World.create({ [workers]: 0, [root]: element });
    const plugins = Plugin.start(world, [todosView], { [root]: element });
    return {
        world,
        dispose: async () => {
            plugins[Symbol.dispose]();
            await world.dispose();
        },
    };
};
