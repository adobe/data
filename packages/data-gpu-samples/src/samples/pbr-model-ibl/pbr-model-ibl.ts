// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const PbrModelIbl = (): TemplateResult => {
    void import("./pbr-model-ibl-element.js");
    return html`<pbr-model-ibl></pbr-model-ibl>`;
};
