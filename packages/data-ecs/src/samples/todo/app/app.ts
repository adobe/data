import { workers, type World } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import { completion } from "../features/completion/feature.js";
import { filter } from "../features/filter/feature.js";
import { generate } from "../features/generate/feature.js";
import { todos } from "../features/todos/feature.js";
import type { Resources } from "../shared/feature.js";

/** The app's features. Each knows only those it builds on; none knows the app. */
const features = [todos, filter, completion, generate];

/** Defines every element the app's features use. */
export const defineElements = (): void => {
    for (const feature of features) feature.define();
};

export type App = { readonly world: World; readonly dispose: () => Promise<void> };

/**
 * Starts the app on the page within `root`, its elements defined: a world whose DOM systems drive the page, holding
 * the fixed elements its features find there, and whose runs the page's events start.
 */
export const createApp = (root: HTMLElement): App => {
    const world = createWorld(features.reduce<Resources>((resources, feature) => ({ ...resources, ...feature.resources(root) }), { [workers]: 0 }));
    for (const feature of features) for (const system of feature.systems) world.add(system);
    const disconnects = features.map(feature => feature.connect(world, root));
    return {
        world,
        dispose: async () => {
            for (const disconnect of disconnects) disconnect();
            await world.dispose();
        },
    };
};
