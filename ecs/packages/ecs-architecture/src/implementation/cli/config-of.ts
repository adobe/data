// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Config } from '../../config.js';

const isStrings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const isRecord = (value: unknown): value is object => typeof value === 'object' && value !== null && !Array.isArray(value);
const entriesOf = (value: object): [string, unknown][] => Object.keys(value).map(key => [key, Reflect.get(value, key)]);

type Banned = NonNullable<Config['banned']>[string][number];
const isBanned = (value: unknown): value is Banned =>
    isRecord(value) && ['module', 'rule', 'fix'].every(key => typeof Reflect.get(value, key) === 'string');

/** A configuration read from JSON, or what's wrong with it. */
export const configOf = (value: unknown): Config | string => {
    if (!isRecord(value)) return '"ecsArchitecture" in package.json is an object.';
    const config: {
        -readonly [K in keyof Config]: Config[K];
    } = {};
    for (const [key, item] of entriesOf(value)) {
        switch (key) {
            case 'source': case 'agents':
                if (typeof item !== 'string') return `"ecsArchitecture.${key}" is a folder's path.`;
                config[key] = item;
                break;
            case 'kinds': case 'apps': case 'headless': case 'systems':
                if (!isStrings(item)) return `"ecsArchitecture.${key}" is a list of names.`;
                config[key] = item;
                break;
            case 'layers': {
                if (!isRecord(item)) return '"ecsArchitecture.layers" maps each layer to the layers it may import.';
                const layers: Record<string, readonly string[]> = {};
                for (const [layer, imports] of entriesOf(item)) {
                    if (!isStrings(imports)) return `"ecsArchitecture.layers.${layer}" is a list of layers.`;
                    layers[layer] = imports;
                }
                config.layers = layers;
                break;
            }
            case 'banned': {
                if (!isRecord(item)) return '"ecsArchitecture.banned" maps a layer to the modules it may not import.';
                const banned: Record<string, readonly Banned[]> = {};
                for (const [layer, list] of entriesOf(item)) {
                    if (!Array.isArray(list) || !list.every(isBanned)) return `"ecsArchitecture.banned.${layer}" is a list of { module, rule, fix }.`;
                    banned[layer] = list;
                }
                config.banned = banned;
                break;
            }
            default:
                return `"ecsArchitecture.${key}" isn't a setting: source, layers, kinds, apps, headless, systems, banned or agents.`;
        }
    }
    return config;
};
