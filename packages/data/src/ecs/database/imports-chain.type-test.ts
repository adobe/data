// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Entity } from "../entity/entity.js";
import type { True, False } from "../../types/types.js";

/**
 * Type-only tests for the `imports` property.
 *
 * `imports` is the complement of `extends`:
 *
 *   - `extends`  — base types are visible to local declarations AND
 *                  re-exported into the result plugin's type.
 *   - `imports`  — base types are visible to local declarations ONLY;
 *                  they do NOT flow into the result plugin's TYPE.
 *
 * The two merge identically at RUNTIME (both pull the base's members into the
 * assembled plugin); they differ only in the result TYPE. That result-type
 * asymmetry is what keeps deep dependency graphs cheap: an `imports` link's
 * result type stays O(local members) instead of accumulating the full chain
 * (see scripts/typeperf — `imports` is linear where `extends` is quadratic in
 * chain depth). Runtime-merge behavior is covered by create-plugin.test.ts
 * ("imports runtime behavior"); this file covers the type contract:
 *   1. Visibility — a plugin that `imports` a base gets FULL type safety on the
 *      base's components/resources/transactions (no weakening vs `extends`).
 *   2. Non-export — the imported members are absent from the result TYPE.
 */

// ============================================================================
// A fat base plugin
// ============================================================================

const basePlugin = createPlugin({
    components: {
        baseColor: { type: 'string' },
        baseWidth: { type: 'number' },
    },
    resources: {
        baseScale: { default: 1 as number },
    },
    transactions: {
        setBaseColor: (t, _input: { color: string }) => { },
        setBaseWidth: (t, _input: { width: number }) => { },
    },
});

// ============================================================================
// 1. Visibility — `imports` gives local declarations full type safety
// ============================================================================

const featurePlugin = createPlugin({
    imports: basePlugin,
    components: {
        featureFlag: { type: 'boolean' },
    },
    transactions: {
        toggleFeature: (t, _input: { on: boolean }) => { },
    },
    actions: {
        // The imported base's transactions are fully typed here — wrong names
        // or argument shapes are compile errors, exactly as with `extends`.
        recolor: async (db, color: string) => {
            db.transactions.setBaseColor({ color });   // imported tx, typed
            db.transactions.toggleFeature({ on: true }); // local tx, typed
            const _scale: number = db.resources.baseScale; // imported resource, typed
        },
    },
});

// Negative guard: referencing a non-existent imported member must NOT compile.
const _negativeGuard = createPlugin({
    imports: basePlugin,
    actions: {
        broken: async (db) => {
            // @ts-expect-error — typo'd transaction name is caught (full safety)
            db.transactions.setBaseColour({ color: 'red' });
            // @ts-expect-error — wrong argument shape is caught
            db.transactions.setBaseWidth({ width: 'wide' });
        },
    },
});

// ============================================================================
// 2. Non-export — imported members are ABSENT from the result type
// ============================================================================

type FeatureResult = typeof featurePlugin;

// Local members ARE present in the result.
type _LocalComponentPresent = True<'featureFlag' extends keyof FeatureResult['components'] ? true : false>;
type _LocalTxPresent = True<'toggleFeature' extends keyof FeatureResult['transactions'] ? true : false>;

// Imported members are NOT re-exported into the result.
type _ImportedComponentAbsent = False<'baseColor' extends keyof FeatureResult['components'] ? true : false>;
type _ImportedResourceAbsent = False<'baseScale' extends keyof FeatureResult['resources'] ? true : false>;
type _ImportedTxAbsent = False<'setBaseColor' extends keyof FeatureResult['transactions'] ? true : false>;

// Contrast: the same base via `extends` DOES re-export.
const extendedPlugin = createPlugin({
    extends: basePlugin,
    components: { featureFlag: { type: 'boolean' } },
});
type ExtendedResult = typeof extendedPlugin;
type _ExtendsReExportsComponent = True<'baseColor' extends keyof ExtendedResult['components'] ? true : false>;
type _ExtendsReExportsTx = True<'setBaseColor' extends keyof ExtendedResult['transactions'] ? true : false>;

// ============================================================================
// 3. To regain the imported members in the TYPE, combine the base back in
//    explicitly (runtime already merged them — this is purely to surface the
//    base's members on the database type for the consumer).
// ============================================================================

function testCombinedUsage() {
    const plugin = Database.Plugin.combine(basePlugin, featurePlugin);
    const db = Database.create(plugin);
    db.transactions.setBaseColor({ color: 'blue' }); // from base
    db.transactions.toggleFeature({ on: false });     // from feature
    db.actions.recolor('green');                      // from feature
    const _e: Entity = 0 as Entity;
}
