// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../../types/assert.js";
import { Equal } from "../../../types/equal.js";
import { Database } from "../database.js";
import { Entity } from "../../entity.js";
import { Observe } from "../../../observe/index.js";
import { observeSelectDeep } from "./observe-select-deep.js";

/**
 * Type-only tests for observeSelectDeep type inference.
 *
 * These tests verify that:
 * 1. observeSelectDeep infers entity data types from included components
 * 2. Only queried components appear in the result type
 * 3. RequiredComponents (id) is always included
 *
 * Note: These are compile-time type checks only — they don't need to execute.
 */

// ============================================================================
// BASIC INFERENCE FROM DATABASE
// ============================================================================

function testObserveSelectDeepBasicInference() {
    const plugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
            velocity: { type: "number" },
            name: { type: "string" },
        },
        archetypes: {
            Moving: ["position", "velocity"],
        },
    });

    const db = Database.create(plugin);

    // Querying position and velocity should infer correct entity data
    const observed = observeSelectDeep(db, ["position", "velocity"]);

    type Result = typeof observed;
    type Expected = Observe<readonly (
        { id: Entity } & { readonly position: number; readonly velocity: number }
    )[]>;

    type CheckResult = Assert<Equal<Result, Expected>>;
}

// ============================================================================
// SINGLE COMPONENT QUERY
// ============================================================================

function testObserveSelectDeepSingleComponent() {
    const plugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
            name: { type: "string" },
        },
    });

    const db = Database.create(plugin);

    // Querying only name should produce id + name
    const observed = observeSelectDeep(db, ["name"]);

    type Result = typeof observed;
    type Expected = Observe<readonly (
        { id: Entity } & { readonly name: string }
    )[]>;

    type CheckResult = Assert<Equal<Result, Expected>>;
}

// ============================================================================
// INVALID COMPONENT NAMES REJECTED
// ============================================================================

function testObserveSelectDeepRejectsInvalidComponents() {
    const plugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
        },
    });

    const db = Database.create(plugin);

    // @ts-expect-error - "nonexistent" is not a valid component name
    observeSelectDeep(db, ["nonexistent"]);
}

// ============================================================================
// WITH OPTIONS (where/order)
// ============================================================================

function testObserveSelectDeepWithOptions() {
    const plugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
            velocity: { type: "number" },
            name: { type: "string" },
        },
        archetypes: {
            Moving: ["position", "velocity"],
        },
    });

    const db = Database.create(plugin);

    // Should accept where/order options scoped to included components
    const observed = observeSelectDeep(db, ["position", "velocity"], {
        where: { position: { ">": 0 } },
        order: { velocity: true },
    });

    type Result = typeof observed;
    type Expected = Observe<readonly (
        { id: Entity } & { readonly position: number; readonly velocity: number }
    )[]>;

    type CheckResult = Assert<Equal<Result, Expected>>;
}

// ============================================================================
// EXTENDED PLUGIN INFERENCE
// ============================================================================

function testObserveSelectDeepWithExtendedPlugin() {
    const basePlugin = Database.Plugin.create({
        components: {
            position: { type: "number" },
        },
        archetypes: {
            Positioned: ["position"],
        },
    });

    const extendedPlugin = Database.Plugin.create({
        extends: basePlugin,
        components: {
            velocity: { type: "number" },
        },
        archetypes: {
            Moving: ["position", "velocity"],
        },
    });

    const db = Database.create(extendedPlugin);

    // Should work with components from both base and extended plugins
    const observed = observeSelectDeep(db, ["position", "velocity"]);

    type Result = typeof observed;
    type Expected = Observe<readonly (
        { id: Entity } & { readonly position: number; readonly velocity: number }
    )[]>;

    type CheckResult = Assert<Equal<Result, Expected>>;
}
