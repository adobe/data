// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const PbrModel = (): TemplateResult => {
    void import("./pbr-model-element.js");
    return html`<pbr-model></pbr-model>`;
};
