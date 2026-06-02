// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const RigidStack = (): TemplateResult => {
    void import("./rigid-stack-element.js");
    return html`<rigid-stack></rigid-stack>`;
};
