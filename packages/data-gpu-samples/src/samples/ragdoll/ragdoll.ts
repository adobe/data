// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const Ragdoll = (): TemplateResult => {
    void import("./ragdoll-element.js");
    return html`<ragdoll-sample></ragdoll-sample>`;
};
