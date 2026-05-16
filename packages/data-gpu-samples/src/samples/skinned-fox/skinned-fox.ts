// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const SkinnedFox = (): TemplateResult => {
    void import("./skinned-fox-element.js");
    return html`<skinned-fox></skinned-fox>`;
};
