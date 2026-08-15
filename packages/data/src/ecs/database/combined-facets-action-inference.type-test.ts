// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import type { Observe } from "../../observe/index.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";

/**
 * Regression: action inference must survive when `computed` and `actions` are
 * declared in the SAME `Database.Plugin.create` call.
 *
 * The bug: the `computed` factory's `db` type referenced the plugin's OWN
 * action declarations (`AD`) — the same type parameter being inferred from the
 * `actions` property. That self-reference made `AD` un-inferable whenever a
 * sibling `computed` was present in the same call, so it collapsed to `{}` and
 * every action vanished (`db.actions.x` → TS2339 on `ToActionFunctions<{}>`).
 * Splitting the facets across layered `create`s hid the bug because each layer
 * inferred `AD` in isolation.
 *
 * The fix: a `computed` factory's `db` surfaces only the BASE plugin's actions
 * (`XP['actions'] & IP['actions']`), never the same-call `actions`. Those are
 * declared AFTER `computed` in the enforced property order, so reading one from
 * a sibling computed was always a forward reference — the action factory `db`
 * already excludes them for the same reason.
 */

// ============================================================================
// 1. POSITIVE — computed + actions in one create; actions stay fully typed.
// ============================================================================

const combined = createPlugin({
    components: { count: { type: "number" } },
    computed: {
        doubled: (_db): Observe<number> => (() => () => {}),
    },
    actions: {
        bump: (_db, _n: number) => { },
    },
});

function combinedActionsAreCallable() {
    const db = Database.create(combined);
    db.actions.bump(1); // was TS2339 before the fix
}

// The declared action survives into the resolved database surface — before the
// fix this key was absent (the action map collapsed to `{}`).
type _ActionResolved = Assert<Equal<
    "bump" extends keyof Database.FromPlugin<typeof combined>["actions"] ? true : false,
    true
>>;

// Negative guard: a genuinely-absent action is still rejected.
function combinedRejectsUnknownAction() {
    const db = Database.create(combined);
    // @ts-expect-error — `nope` was never declared.
    db.actions.nope();
}

// ============================================================================
// 2. Layered create (control) — always worked; must keep working.
// ============================================================================

const base = createPlugin({ components: { count: { type: "number" } } });
const withComputed = createPlugin({
    extends: base,
    computed: { doubled: (_db): Observe<number> => (() => () => {}) },
});
const withActions = createPlugin({
    extends: withComputed,
    actions: { bump: (_db, _n: number) => { } },
});

function layeredActionsAreCallable() {
    const db = Database.create(withActions);
    db.actions.bump(1);
}

// ============================================================================
// 3. Semantics — a computed sees BASE actions but not same-create siblings.
// ============================================================================

const actionBase = createPlugin({
    components: { count: { type: "number" } },
    actions: { baseAct: (_db) => { } },
});

createPlugin({
    extends: actionBase,
    computed: {
        // A computed CAN compose on a base plugin's already-resolved action.
        readsBaseAction: (db): Observe<unknown> => {
            db.actions.baseAct();
            return (() => () => {});
        },
    },
    actions: {
        siblingAct: (_db) => { },
    },
});

createPlugin({
    components: { count: { type: "number" } },
    computed: {
        noSiblingActions: (db): Observe<unknown> => {
            // @ts-expect-error — a same-create sibling action is a forward
            // reference (actions are declared after computed) and must be absent.
            db.actions.siblingAct2();
            return (() => () => {});
        },
    },
    actions: {
        siblingAct2: (_db) => { },
    },
});
