// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { requireMaterial } from "@adobe/data-gpu/material";
import { rapierSolver } from "@adobe/data-gpu/physics";
import {
    boneColliders,
    joltRagdoll,
    Model,
    Orbit,
    pbrFactorRender,
    pbrSkinning,
    physicsRenderBridge,
    ragdollTrigger,
    shapeGeometry,
} from "@adobe/data-gpu/graphics";

const ragdollScene = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrFactorRender, pbrSkinning, shapeGeometry, physicsRenderBridge, ragdollTrigger, Orbit.plugin),
    transactions: {
        initializeScene(t, args: { modelUrl: string; envUrl?: string }): number {
            t.resources.light = { ...t.resources.light, environmentUrl: args.envUrl ?? t.resources.light.environmentUrl, color: [0.55, 0.55, 0.55] };
            const meshId = Model.plugin.transactions.insertGltfMesh(t, { url: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { mesh: meshId, position: [0, 0.9, 0] });
            t.archetypes.StaticCollider.insert({
                colliderShape: "box", halfExtents: [4, 0.25, 4], material: requireMaterial(t, "stone"),
                position: [0, -0.25, 0], rotation: [0, 0, 0, 1],
            });
            t.resources.orbit = { ...t.resources.orbit, center: [0, 0.4, 0], radius: 3.2, height: 1.4, autoSpinSpeed: 0.15 };
            return meshId;
        },
    },
    systems: {
        autoplayAnimation: {
            schedule: { during: ["update"] },
            create: db => {
                const started = new Set<number>();
                return () => {
                    for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonMesh"])) {
                        const ids = arch.columns.id, jc = arch.columns._skeletonJoints, mc = arch.columns._skeletonMesh;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const skeleton = ids.get(i);
                            if (started.has(skeleton)) continue;
                            const clips = (db.store.read(mc.get(i)) as { animationClipRefs?: number[] } | null)?.animationClipRefs ?? [];
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
export const ragdollJoltPlugin = Database.Plugin.combine(ragdollScene, joltRagdoll);
