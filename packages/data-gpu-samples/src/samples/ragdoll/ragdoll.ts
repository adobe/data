// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

/**
 * A rigged humanoid walks then ragdolls, on both solvers side by side: Jolt
 * (cone/swing-twist anatomical limits) next to Rapier (free-ball — its binding
 * has no cone constraint). Same scene + skeleton through the shared base.
 */
export const Ragdoll = (): TemplateResult => {
    void import("./ragdoll-jolt-element.js");
    void import("./ragdoll-rapier-element.js");
    return html`
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
            <ragdoll-jolt></ragdoll-jolt>
            <ragdoll-rapier></ragdoll-rapier>
        </div>
    `;
};
