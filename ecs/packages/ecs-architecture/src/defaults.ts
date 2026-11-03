// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Config } from './config.js';

/** The standard's organization, which a `Config` changes part by part. */
export const defaults: Required<Config> = {
    source: 'src',
    layers: {
        elements: ['elements'],
        model: ['model'],
        ports: ['model', 'ports'],
        view: ['model', 'elements', 'view'],
    },
    kinds: ['type', 'constant', 'component', 'resource', 'archetype', 'index', 'function', 'system', 'rule', 'finalizer', 'element'],
    apps: ['app', 'apps', 'samples', 'perftest'],
    headless: ['model'],
    systems: ['model', 'view'],
    banned: {
        elements: [{
            module: '@adobe/', rule: 'elements-know-nothing-of-the-ecs',
            fix: 'Elements are plain custom elements that know nothing of the ECS: they take properties and dispatch DOM events. Move the part that needs the ECS to the feature\'s view.',
        }],
        model: [
            {
                module: '@adobe/ecs-gpu', rule: 'model-is-headless',
                fix: 'The model runs headless: no GPU. Move this code to the feature\'s view, and if model systems must be ordered against it, declare the before or after in the view.',
            },
            { module: 'lit', rule: 'model-is-headless', fix: 'The model runs headless: no UI library. Move this code to the feature\'s view or elements.' },
            { module: '@lit/', rule: 'model-is-headless', fix: 'The model runs headless: no UI library. Move this code to the feature\'s view or elements.' },
        ],
        ports: [{ module: '@adobe/ecs-gpu', rule: 'ports-no-gpu', fix: '@adobe/ecs-gpu belongs to the view: drawing goes in the feature\'s view.' }],
    },
};
