// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { pbrRender, pbrSkinning, boneColliders, physicsRenderBridge, shapeGeometry, joltSolver, Model, Orbit } from "@adobe/data-gpu";

/**
 * ragdoll — a rigged humanoid plays its walk clip while one capsule per bone,
 * auto-fitted from the skin and driven by `boneColliders`, tracks the animated
 * skeleton. This is ragdoll step 1: the live, animation-driven collision proxy
 * (the capsules are kinematic; flipping them to dynamic + joints is the next
 * step). The capsules render over the character as a debug visualisation.
 */
export const ragdollPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrRender, pbrSkinning, boneColliders, physicsRenderBridge, shapeGeometry, joltSolver, Orbit.plugin),
    transactions: {
        initializeScene(t, args: { modelUrl: string; envUrl?: string }): number {
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: args.envUrl ?? t.resources.light.environmentUrl,
                color: [0.55, 0.55, 0.55],
            };
            const geoId = Model.plugin.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { geometry: geoId, position: [0, 0.9, 0] }); // lifted, so the ragdoll drops onto the floor
            // a ground slab for the ragdoll to land on (top face at y = 0)
            t.archetypes.StaticCollider.insert({
                colliderShape: "box", halfExtents: [4, 0.25, 4], material: t.resources.materials.stone,
                position: [0, -0.25, 0], rotation: [0, 0, 0, 1],
            });
            t.resources.orbit = {
                ...t.resources.orbit,
                center: [0, 0.4, 0], radius: 3.2, height: 1.4, autoSpinSpeed: 0.15,
            };
            return geoId;
        },
    },
    systems: {
        // Once a skeleton + its animation clips have loaded, start the first clip
        // looping (no sample plays animations by default). Targets = the skeleton's
        // joints, in order (animation tracks index into them).
        autoplayAnimation: {
            schedule: { during: ["update"] },
            create: db => {
                const started = new Set<number>(); // skeletons whose clip we've launched
                return () => {
                    for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonGeometry"])) {
                        const ids = arch.columns.id, jc = arch.columns._skeletonJoints, gc = arch.columns._skeletonGeometry;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const skeleton = ids.get(i);
                            if (started.has(skeleton)) continue;
                            const clips = (db.store.read(gc.get(i)) as { _animationClipRefs?: number[] } | null)?._animationClipRefs ?? [];
                            if (clips.length === 0) continue; // model / animations not loaded yet
                            // direct store insert (one row); the transaction form replays as transient+commit here
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
        // Let it walk for a few seconds, then go limp (drop onto the floor).
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

export type RagdollService = Database.Plugin.ToDatabase<typeof ragdollPlugin>;
