// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { FrameTime } from "../../core/frame-time/frame-time.js";
import { animationData } from "./animation-data-plugin.js";

/**
 * Full animation plugin — declarative data (from `scene/animation-plugin.ts`)
 * plus the per-frame `animationSampleSystem` that advances all playing entities.
 *
 * Exported as `animation` from index.ts. The data-only part lives in
 * `scene/animation-plugin.ts` and is included in the `scene` aggregator.
 */
export const animation = Database.Plugin.create({
    extends: Database.Plugin.combine(animationData, FrameTime.plugin),
    systems: {
        animationSampleSystem: {
            create: db => () => {
                const dt = db.store.resources.frameTime.dt;
                if (dt <= 0) return;
                db.transactions.advanceAnimations({ dt, observable: true });
                animationData.transactions.advanceAnimations(db.store, { dt, observable: false });
            },
        },
    },
});
