// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from '../world/world.js';
import { Plugin } from './plugin.js';

declare module '@adobe/ecs' {
    interface PluginConfig {
        pluginTypeTestName: string;
        pluginTypeTestCount: number;
        pluginTypeTestNote?: string;
    }
}

declare const world: World;
const named: Plugin<"pluginTypeTestName"> = { systems: [], connect: (_, { pluginTypeTestName }) => () => void pluginTypeTestName.length };
const counted: Plugin<"pluginTypeTestCount" | "pluginTypeTestNote"> = { systems: [], connect: (_, { pluginTypeTestCount }) => () => void pluginTypeTestCount };
const plain: Plugin = { systems: [] };

// A config holds every name its plugins ask for, and an optional one may be left out.
Plugin.start(world, [named, counted, plain], { pluginTypeTestName: "a", pluginTypeTestCount: 2 });
Plugin.start(world, [plain], {});

// @ts-expect-error pluginTypeTestCount is asked for by a plugin and not given.
Plugin.start(world, [named, counted], { pluginTypeTestName: "a" });
// @ts-expect-error pluginTypeTestName is a string.
Plugin.start(world, [named], { pluginTypeTestName: 1 });
// @ts-expect-error no plugin asks for pluginTypeTestCount.
Plugin.start(world, [named], { pluginTypeTestName: "a", pluginTypeTestCount: 2 });
// @ts-expect-error a plugin names only values PluginConfig declares.
export const undeclared: Plugin<"pluginTypeTestMissing"> = { systems: [] };
// @ts-expect-error connect reads only the names it asks for.
export const overreaching: Plugin<"pluginTypeTestName"> = { systems: [], connect: (_, { pluginTypeTestCount }) => () => void pluginTypeTestCount };
