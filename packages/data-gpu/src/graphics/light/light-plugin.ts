// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";

/**
 * Authored lighting state — a directional light plus optional image-based
 * lighting from an HDR environment.
 *
 * The `sceneUniforms` system packs these into the GPU uniform buffer the
 * renderers consume; the `iblInitSystem` fetches and bakes the IBL textures
 * from `environmentUrl`.
 */
export const light = Database.Plugin.create({
    resources: {
        lightDirection:  { default: Vec3.normalize([-1, -3, -10]) },
        lightColor:      { default: [1.0, 1.0, 1.0] as Vec3 },
        ambientStrength: { default: 0.5 as F32 },
        environmentUrl:  { default: null as string | null, transient: true },
    },
    transactions: {
        setLight(t, args: { direction?: Vec3; color?: Vec3; ambient?: number }) {
            if (args.direction !== undefined) t.resources.lightDirection = Vec3.normalize(args.direction);
            if (args.color !== undefined)     t.resources.lightColor = args.color;
            if (args.ambient !== undefined)   t.resources.ambientStrength = args.ambient;
        },
        setEnvironmentUrl(t, url: string | null) {
            t.resources.environmentUrl = url;
        },
    },
});
