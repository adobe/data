// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const MetalRoughSpheres = (): TemplateResult => {
    void import("./metal-rough-spheres-element.js");
    return html`<metal-rough-spheres></metal-rough-spheres>`;
};
