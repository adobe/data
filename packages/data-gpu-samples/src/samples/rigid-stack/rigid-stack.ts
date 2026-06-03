// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

/**
 * Same scene, three solvers, side by side: our CPU-XPBD solver next to the
 * Rapier and Jolt references. All run the identical (seeded) drop sequence
 * through the shared `physicsData` seam, so the comparison is apples-to-apples.
 */
export const RigidStack = (): TemplateResult => {
    void import("./rigid-stack-element.js");
    void import("./rigid-stack-rapier-element.js");
    void import("./rigid-stack-jolt-element.js");
    return html`
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
            <rigid-stack-cpu></rigid-stack-cpu>
            <rigid-stack-rapier></rigid-stack-rapier>
            <rigid-stack-jolt></rigid-stack-jolt>
        </div>
    `;
};
