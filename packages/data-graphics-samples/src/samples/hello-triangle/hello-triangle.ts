// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const HelloTriangle = (): TemplateResult => {
    void import("./hello-triangle-element.js");
    return html`<hello-triangle></hello-triangle>`;
};
