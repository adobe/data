// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { MainService } from "../shared/main-service.js";
import type { SubService } from "../shared/sub-service.js";

/** Lazy wrapper: imports the element module, then renders it with its services. */
export const MainPanel = (args: { local: MainService; remote: SubService }): TemplateResult => {
    void import("./main-panel-element.js");
    return html`<main-panel .local=${args.local} .remote=${args.remote}></main-panel>`;
};
