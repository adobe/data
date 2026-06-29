// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Model, Orbit, pbrIblRender } from "@adobe/data-gpu/graphics";

export const pbrModelIblPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, Orbit.plugin),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: readonly [number, number, number];
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: args.envUrl ?? t.resources.light.environmentUrl,
                color:          args.lightColor ?? t.resources.light.color,
            };
            const meshId = Model.plugin.transactions.insertGltfMesh(t, { url: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { mesh: meshId });
            t.resources.orbit = {
                ...t.resources.orbit,
                fitMesh:         meshId,
                fitRadiusFactor: args.orbitFit?.radiusFactor ?? t.resources.orbit.fitRadiusFactor,
                fitHeightFactor: args.orbitFit?.heightFactor ?? t.resources.orbit.fitHeightFactor,
            };
            return meshId;
        },
    },
});

export type PbrModelIblService = Database.Plugin.ToDatabase<typeof pbrModelIblPlugin>;
