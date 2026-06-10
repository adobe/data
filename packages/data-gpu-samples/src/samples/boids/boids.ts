// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const Boids = (): TemplateResult => {
    void import("./boids-element.js");
    return html`<boids-sample></boids-sample>`;
};
