// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { pbrRender, pbrSkinning, boneColliders, joltRagdoll, physicsRenderBridge, shapeGeometry, ragdollTrigger, rapierSolver, Model, Orbit } from "@adobe/data-gpu";

/**
 * ragdoll — a rigged humanoid walks, then goes limp and collapses onto the floor.
 * The same scene runs **side by side on both solvers** through a shared base
 * (`ragdollScene`): per-bone capsules are auto-fitted from the skin and track the
 * walk, then `triggerRagdoll` flips them to dynamic so the skinned mesh flops.
 *
 * The two panels use **different ragdoll backends** through the same scene +
 * `ragdollTrigger`: Jolt runs its **native `Ragdoll`** (`joltRagdoll` — swing-twist
 * limits, parent-child collision filtering, pose-driven), while Rapier runs **our
 * generic `boneColliders`** (free-ball, since Rapier's binding has no cone joint).
 */
const ragdollScene = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrRender, pbrSkinning, shapeGeometry, physicsRenderBridge, ragdollTrigger, Orbit.plugin),
    transactions: {
        initializeScene(t, args: { modelUrl: string; envUrl?: string }): number {
            t.resources.light = { ...t.resources.light, environmentUrl: args.envUrl ?? t.resources.light.environmentUrl, color: [0.55, 0.55, 0.55] };
            const geoId = Model.plugin.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { geometry: geoId, position: [0, 0.9, 0] }); // lifted, so the ragdoll drops onto the floor
            t.archetypes.StaticCollider.insert({
                colliderShape: "box", halfExtents: [4, 0.25, 4], material: t.resources.materials.stone,
                position: [0, -0.25, 0], rotation: [0, 0, 0, 1],
            });
            t.resources.orbit = { ...t.resources.orbit, center: [0, 0.4, 0], radius: 3.2, height: 1.4, autoSpinSpeed: 0.15 };
            return geoId;
        },
    },
    systems: {
        // Start the model's first clip looping once skeleton + clips have loaded.
        autoplayAnimation: {
            schedule: { during: ["update"] },
            create: db => {
                const started = new Set<number>();
                return () => {
                    for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonGeometry"])) {
                        const ids = arch.columns.id, jc = arch.columns._skeletonJoints, gc = arch.columns._skeletonGeometry;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const skeleton = ids.get(i);
                            if (started.has(skeleton)) continue;
                            const clips = (db.store.read(gc.get(i)) as { _animationClipRefs?: number[] } | null)?._animationClipRefs ?? [];
                            if (clips.length === 0) continue;
                            db.store.archetypes.Animation.insert({
                                animationClipRef: clips[0], animationTargets: [...jc.get(i)],
                                animationTime: 0, animationSpeed: 1, animationLoop: true, animationPlaying: true,
                            });
                            started.add(skeleton);
                        }
                    }
                };
            },
        },
        // Walk for a few seconds, then go limp (the active ragdoll backend handles it).
        autoRagdoll: {
            schedule: { during: ["update"] },
            create: db => {
                let fired = false;
                return () => {
                    if (fired || db.store.resources.frameTime.elapsed < 4) return;
                    db.transactions.triggerRagdoll();
                    fired = true;
                };
            },
        },
    },
});

export const ragdollRapierPlugin = Database.Plugin.combine(ragdollScene, boneColliders, rapierSolver);
export const ragdollJoltPlugin = Database.Plugin.combine(ragdollScene, joltRagdoll); // joltRagdoll brings joltSolver
