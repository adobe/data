// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html } from "lit";
import type { TemplateResult } from "lit";

export const CesiumMilkTruck = (): TemplateResult => {
    void import("./cesium-milk-truck-element.js");
    return html`<cesium-milk-truck></cesium-milk-truck>`;
};
