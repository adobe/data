// © 2026 Adobe. MIT License. See /LICENSE for details.
import { create } from '../system/create.js';
import type { World } from '../world/world.js';
import type { PluginConfig } from './config.js';
import type { Plugin } from './plugin.js';

/** The names a plugin's `connect` asks for. */
type NamesOf<P> = P extends { readonly connect?: (world: World, config: infer Config) => unknown } ? keyof Config & keyof PluginConfig : never;

/**
 * Adds every plugin's systems to `world` as one composite, then connects each plugin in order with `config`, which
 * holds every name they ask for. Disposing it disconnects them in reverse order, then removes their systems, and
 * throws what threw doing so once all are done: one error as it is, more as an `AggregateError`. When a `connect`
 * throws, the plugins already connected are disconnected and the systems removed before it rethrows, in an
 * `AggregateError` after what the disconnects threw where they threw.
 */
export function start<const Plugins extends readonly Plugin<keyof PluginConfig>[]>(
    world: World,
    plugins: Plugins,
    config: Pick<PluginConfig, NamesOf<Plugins[number]>>,
): Disposable;
export function start(world: World, plugins: readonly Plugin[], config: Pick<PluginConfig, never>): Disposable {
    const systems = create({ systems: plugins.flatMap(plugin => plugin.systems) });
    world.add(systems);
    const disconnects: (() => void)[] = [];
    /** Disconnects every plugin connected, in reverse order, then removes the systems; gives what threw. */
    const stop = (): unknown[] => {
        const failures: unknown[] = [];
        for (let i = disconnects.length - 1; i >= 0; i--) {
            try {
                disconnects[i]();
            } catch (error) {
                failures.push(error);
            }
        }
        disconnects.length = 0;
        try {
            world.remove(systems);
        } catch (error) {
            failures.push(error);
        }
        return failures;
    };
    try {
        for (const plugin of plugins) if (plugin.connect) disconnects.push(plugin.connect(world, config));
    } catch (error) {
        const failures = stop();
        throw failures.length === 0 ? error : new AggregateError([error, ...failures], "A plugin failed to connect, and stopping the plugins connected before it failed.");
    }
    let stopped = false;
    return {
        [Symbol.dispose]: () => {
            if (stopped) return;
            stopped = true;
            const failures = stop();
            if (failures.length === 1) throw failures[0];
            if (failures.length > 1) throw new AggregateError(failures, "Plugins failed to stop.");
        },
    };
}
