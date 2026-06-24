// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

/**
 * ragdollTrigger — the backend-agnostic "go limp" signal. A scene calls
 * `triggerRagdoll()`; whichever ragdoll backend is combined in (our generic
 * `boneColliders`, or the Jolt-native `joltRagdoll`) consumes `_ragdollTrigger`
 * once and switches its bones to dynamic. Sharing the flag lets the same scene
 * drive either backend, so a sample can run our ragdoll on one solver and Jolt's
 * on another, side by side.
 */
export const ragdollTrigger = Database.Plugin.create({
    resources: {
        _ragdollTrigger: { default: false as boolean, nonPersistent: true },
    },
    transactions: {
        /** Go limp: the active ragdoll backend flips its bones to dynamic. */
        triggerRagdoll(t) { t.resources._ragdollTrigger = true; },
    },
});
