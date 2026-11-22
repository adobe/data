// © 2026 Adobe. MIT License. See /LICENSE for details.
// The Spectrum elements the page uses, which define themselves as they load.
import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/theme-dark.js";
import "@spectrum-web-components/theme/scale-medium.js";
import "@spectrum-web-components/action-button/sp-action-button.js";
import "@spectrum-web-components/action-group/sp-action-group.js";
import { createApp } from "./function.create-app.js";

// The page's markup holds the fixed elements; the app starts on them as the page loads this module.
void createApp(document.body).then(app => {
    if (!app.drawn) document.querySelector(".no-gpu")?.removeAttribute("hidden");
});
