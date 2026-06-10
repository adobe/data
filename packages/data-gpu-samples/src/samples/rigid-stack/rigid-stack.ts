// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

/**
 * Same scene, two reference solvers side by side: Jolt (the default) next to
 * Rapier. Both run the identical (seeded) drop sequence through the shared
 * `physicsData` seam, so the comparison is apples-to-apples. See the solver
 * guidance in @adobe/data-gpu's physics/solvers/README.md.
 */
export const RigidStack = (): TemplateResult => {
    void import("./rigid-stack-jolt-element.js");
    void import("./rigid-stack-rapier-element.js");
    return html`
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
            <rigid-stack-jolt></rigid-stack-jolt>
            <rigid-stack-rapier></rigid-stack-rapier>
        </div>
    `;
};
