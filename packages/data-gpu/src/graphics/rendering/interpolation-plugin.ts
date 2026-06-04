// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { physicsData } from "../../physics/physics-data-plugin.js";
import { physicsClock } from "../../physics/physics-clock-plugin.js";
import { displayTransform } from "./display-transform-plugin.js";

/**
 * interpolation — the single pre-render pass that turns the fixed-step physics
 * state into a smooth display pose. Because the solver steps on `physicsClock`
 * (0..N steps/frame), the canonical `position`/`rotation` jump in fixed
 * increments; rendering them raw judders when the render rate ≠ the sim rate.
 *
 * Each render frame this blends `_prevPosition`→`position` (and the rotations)
 * by `physicsClock.alpha` into `_renderPosition`/`_renderRotation`, which the
 * renderer draws. Doing it once here (not in each renderer) keeps render systems
 * free of physics knowledge — they only read the display transform.
 *
 * Bodies gain `_renderPosition`/`_renderRotation` the first frame after the
 * solver has mirrored them (i.e. once `_prevPosition` exists); the tag-exclude
 * query means steady state never re-scans already-equipped bodies.
 */

// Dynamic bodies that have been mirrored (so `_prevPosition` exists) but don't
// yet carry the display-pose columns — give them those columns once.
const NEEDS_RENDER_POSE = ["position", "rotation", "_prevPosition"] as const;
const WITHOUT_RENDER_POSE = { exclude: ["_renderPosition"] } as const;
// Fully-equipped bodies: blend prev→current into the display pose every frame.
const INTERPOLATED = ["position", "rotation", "_prevPosition", "_prevRotation", "_renderPosition", "_renderRotation"] as const;

export const interpolation = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, physicsClock, displayTransform),
    systems: {
        interpolateDisplayPose: {
            schedule: { during: ["preRender"] },
            create: db => () => {
                // 1) Equip newly-mirrored bodies with display-pose columns (seed = current
                //    pose). Tail→head: every visited row migrates out on gaining the columns.
                for (const arch of db.store.queryArchetypes(NEEDS_RENDER_POSE, WITHOUT_RENDER_POSE)) {
                    const ids = arch.columns.id, pos = arch.columns.position, ori = arch.columns.rotation;
                    for (let r = arch.rowCount - 1; r >= 0; r--) {
                        db.store.update(ids.get(r), { _renderPosition: pos.get(r), _renderRotation: ori.get(r) });
                    }
                }

                // 2) Blend prev→current by alpha into the display pose — every frame, in
                //    place (no migration), straight on the backing typed arrays.
                const alpha = db.store.resources.physicsClock.alpha;
                for (const arch of db.store.queryArchetypes(INTERPOLATED)) {
                    const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                    const pp = arch.columns._prevPosition.getTypedArray(), pr = arch.columns._prevRotation.getTypedArray();
                    const rp = arch.columns._renderPosition.getTypedArray(), rr = arch.columns._renderRotation.getTypedArray();
                    for (let r = 0; r < arch.rowCount; r++) {
                        const r3 = r * 3, r4 = r * 4;
                        rp[r3] = pp[r3] + (pos[r3] - pp[r3]) * alpha;
                        rp[r3 + 1] = pp[r3 + 1] + (pos[r3 + 1] - pp[r3 + 1]) * alpha;
                        rp[r3 + 2] = pp[r3 + 2] + (pos[r3 + 2] - pp[r3 + 2]) * alpha;
                        // nlerp with shortest-path sign flip — cheap, allocation-free, and
                        // visually exact for the small per-step rotations of interpolation.
                        let ax = pr[r4], ay = pr[r4 + 1], az = pr[r4 + 2], aw = pr[r4 + 3];
                        const bx = ori[r4], by = ori[r4 + 1], bz = ori[r4 + 2], bw = ori[r4 + 3];
                        if (ax * bx + ay * by + az * bz + aw * bw < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
                        const x = ax + (bx - ax) * alpha, y = ay + (by - ay) * alpha, z = az + (bz - az) * alpha, w = aw + (bw - aw) * alpha;
                        const inv = 1 / Math.hypot(x, y, z, w);
                        rr[r4] = x * inv; rr[r4 + 1] = y * inv; rr[r4 + 2] = z * inv; rr[r4 + 3] = w * inv;
                    }
                }
            },
        },
    },
});
