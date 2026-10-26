// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World, workers } from "@adobe/ecs";
import { features } from "../features/index.js";
import { all } from "../shared/connect.js";
import { define } from "../shared/elements/define.js";
import type { Resources } from "../shared/feature.js";
import "./spectrum.js";

export type App = { readonly world: World; readonly dispose: () => Promise<void> };

/**
 * Starts the guide on the page within `root`, its elements defined: a world whose DOM systems drive the page, holding
 * the fixed elements and services its features find or make, which each feature starts in turn before the page's
 * events start runs.
 */
export const createApp = async (root: HTMLElement): Promise<App> => {
    for (const feature of features) define(feature.elements);
    const world = World.create(features.reduce<Resources>((resources, feature) => ({ ...resources, ...feature.resources(root) }), { [workers]: 0 }));
    for (const { system } of features) if (system !== null) world.add(system);
    for (const feature of features) await feature.start(world);
    const disconnect = all(...features.map(feature => feature.connect(world, root)));
    return {
        world,
        dispose: async () => {
            disconnect();
            await world.dispose();
        },
    };
};
