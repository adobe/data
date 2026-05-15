// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const SolarSystem = (): TemplateResult => {
    void import("./solar-system-element.js");
    return html`<solar-system></solar-system>`;
};
