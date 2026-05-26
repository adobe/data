// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import { pbrIblRender, Model, Orbit } from "@adobe/data-gpu";

export const pbrModelIblPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, Orbit.plugin),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: args.envUrl ?? t.resources.light.environmentUrl,
                color:          args.lightColor ?? t.resources.light.color,
            };
            const geoId = Model.plugin.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { geometry: geoId });
            t.resources.orbit = {
                ...t.resources.orbit,
                fitGeometry:     geoId,
                fitRadiusFactor: args.orbitFit?.radiusFactor ?? t.resources.orbit.fitRadiusFactor,
                fitHeightFactor: args.orbitFit?.heightFactor ?? t.resources.orbit.fitHeightFactor,
            };
            return geoId;
        },
    },
});

export type PbrModelIblService = Database.Plugin.ToDatabase<typeof pbrModelIblPlugin>;
