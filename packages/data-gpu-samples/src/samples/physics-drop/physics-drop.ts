// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const PhysicsDrop = (): TemplateResult => {
    void import("./physics-drop-element.js");
    return html`<physics-drop></physics-drop>`;
};
