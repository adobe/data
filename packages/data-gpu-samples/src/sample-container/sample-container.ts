// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const SampleContainer = (): TemplateResult => {
    void import("./sample-container-element.js");
    return html`<sample-container></sample-container>`;
};
