// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3, Quat } from "@adobe/data/math";

/**
 * The **display transform** seam — the pose a renderer should actually draw at,
 * which may differ from the canonical `position`/`rotation` (the authoritative
 * gameplay/sim state). When physics runs on a fixed clock faster or slower than
 * the render rate, an interpolation pass writes the blended prev→current pose
 * here each render frame so motion stays smooth; gameplay still reads the
 * canonical pose.
 *
 * Both `_`-prefixed (derived, not authored). A renderer reads `_renderPosition`/
 * `_renderRotation` *when present* and otherwise falls back to the canonical
 * `position`/`rotation` — so this plugin is a pure, physics-free dependency:
 * graphics-only scenes register the components (harmless, unused) and bodies that
 * nothing interpolates simply never gain them. The producer is
 * `interpolation-plugin` (physics → display); the consumer is any renderer.
 */
export const displayTransform = Database.Plugin.create({
    components: {
        _renderPosition: { ...Vec3.schema, nonPersistent: true }, // derived: interpolated pose to render at (else use `position`)
        _renderRotation: { ...Quat.schema, nonPersistent: true },
    },
});
