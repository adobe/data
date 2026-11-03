// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '../system/system.js';
import type { World } from '../world/world.js';
import type { PluginConfig } from './config.js';

/**
 * What an app adds to a world and removes as a unit: the systems it adds, and optionally `connect`, which connects the
 * world to what's outside it with the values of `PluginConfig` named by `Names`, and returns what disconnects it.
 */
export type Plugin<Names extends keyof PluginConfig = never> = {
    readonly systems: readonly System<void>[];
    readonly connect?: (world: World, config: Pick<PluginConfig, Names>) => () => void;
};

export * as Plugin from './index.js';
