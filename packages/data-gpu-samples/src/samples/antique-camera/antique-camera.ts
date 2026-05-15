// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const AntiqueCamera = (): TemplateResult => {
    void import("./antique-camera-element.js");
    return html`<antique-camera></antique-camera>`;
};
