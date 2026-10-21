import { workers, type World } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import * as exported from "../features/index.js";
import { all } from "../shared/connect.js";
import { define } from "../shared/elements/define.js";
import type { Resources } from "../shared/feature.js";
import { logFailures } from "./log-failures.js";

/** The app's features, every one `features/index.ts` exports. Each knows only those it builds on; none knows the app. */
const features = Object.values(exported);

export type App = { readonly world: World; readonly dispose: () => Promise<void> };

/**
 * Starts the app on the page within `root`, its elements defined: a world whose DOM systems drive the page, holding
 * the fixed elements its features find there, and whose runs the page's events start.
 */
export const createApp = (root: HTMLElement): App => {
    for (const feature of features) define(feature.elements);
    const world = createWorld(features.reduce<Resources>((resources, feature) => ({ ...resources, ...feature.resources(root) }), { [workers]: 0 }));
    for (const { system } of features) if (system !== null) world.add(system);
    world.add(logFailures);
    const disconnect = all(...features.map(feature => feature.connect(world, root)));
    return {
        world,
        dispose: async () => {
            disconnect();
            await world.dispose();
        },
    };
};
