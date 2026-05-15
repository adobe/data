// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const PbrIblInstanced = (): TemplateResult => {
    void import("./pbr-ibl-instanced-element.js");
    return html`<pbr-ibl-instanced></pbr-ibl-instanced>`;
};
