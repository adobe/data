// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb, Quat, Vec3 } from "@adobe/data/math";
import { graphics } from "../../plugins/graphics.js";
import { node } from "../../plugins/node.js";
import { loadGltfPrimitives, type GpuPrimitiveData } from "../gltf/load-gltf-model.js";
import { pbrCore } from "./pbr-core.js";

interface LoadedArgs {
    pbrGeometryRef: number;
    bounds: Aabb;
    primitives: GpuPrimitiveData[];
}

/**
 * Declarative GLTF model loader. Provides two user-facing archetypes:
 *
 * - **Geometry**: insert with `{ pbrModelUrl }`. The loader system fetches,
 *   parses, and uploads the model. When done, `pbrModelBounds` is added to
 *   the entity (its presence signals that loading is complete).
 *
 * - **Model**: insert with `{ pbrGeometryRef, position?, rotation?, scale? }`.
 *   Presence of a visible Model is what causes its Geometry's primitives to
 *   be drawn each frame.
 */
export const pbrModelLoader = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, node, graphics),
    components: {
        pbrModelUrl: { default: "" as string },
        pbrModelBounds: { default: null as unknown as Aabb },
    },
    archetypes: {
        Geometry: ["pbrModelUrl"],
        Model: ["pbrGeometryRef", "position", "rotation", "scale", "visible"],
    },
    transactions: {
        insertGeometry(t, args: { pbrModelUrl: string }): number {
            return t.archetypes.Geometry.insert({ pbrModelUrl: args.pbrModelUrl });
        },
        insertModel(t, args: { pbrGeometryRef: number; position?: Vec3; rotation?: Quat; scale?: Vec3 }): number {
            return t.archetypes.Model.insert({
                pbrGeometryRef: args.pbrGeometryRef,
                position: args.position ?? [0, 0, 0],
                rotation: args.rotation ?? [0, 0, 0, 1],
                scale: args.scale ?? [1, 1, 1],
                visible: true,
            });
        },
        pbrInsertLoadedPrimitives(t, args: LoadedArgs) {
            for (const p of args.primitives) {
                const materialId = t.archetypes.PbrMaterial.insert({
                    ephemeral: true,
                    pbrMaterialBindGroup: p.pbrMaterialBindGroup,
                    pbrGeometryRef: args.pbrGeometryRef,
                });
                t.archetypes.PbrPrimitive.insert({
                    ephemeral: true,
                    pbrGeometryRef: args.pbrGeometryRef,
                    pbrMaterialRef: materialId,
                    pbrVertexBuffer: p.pbrVertexBuffer,
                    pbrIndexBuffer: p.pbrIndexBuffer,
                    pbrIndexCount: p.pbrIndexCount,
                    pbrIndexFormat: p.pbrIndexFormat,
                });
            }
            t.update(args.pbrGeometryRef, { pbrModelBounds: args.bounds });
        },
    },
    systems: {
        pbrModelLoadSystem: {
            create: db => {
                const inFlight = new Set<number>();
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    for (const arch of db.store.queryArchetypes(["pbrModelUrl"])) {
                        const ids = arch.columns.id;
                        const urls = arch.columns.pbrModelUrl;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i) as number;
                            if (inFlight.has(id)) continue;
                            inFlight.add(id);
                            loadGltfPrimitives(device, urls.get(i) as string)
                                .then(({ primitives, bounds }) => {
                                    db.transactions.pbrInsertLoadedPrimitives({
                                        pbrGeometryRef: id,
                                        bounds,
                                        primitives,
                                    });
                                })
                                .catch(err => {
                                    console.error("[pbrModelLoader] Failed to load model", urls.get(i), err);
                                });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
