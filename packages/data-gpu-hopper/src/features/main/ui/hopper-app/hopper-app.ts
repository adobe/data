// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";

// The one public UI import: a lazy wrapper that dynamically loads the element
// (and, transitively, the whole render + GPU chunk) only when first rendered.
export const Hopper = (): TemplateResult => {
  void import("./hopper-app-element.js");
  return html`<hopper-app></hopper-app>`;
};
