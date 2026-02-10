// © 2026 Adobe. MIT License. See /LICENSE for details.

import "@spectrum-web-components/theme/sp-theme.js";
import "@spectrum-web-components/theme/theme-light.js";
import "@spectrum-web-components/theme/scale-medium.js";
import "@spectrum-web-components/styles/all-medium-light.css";
import { samples } from "./index.js";

const app = document.getElementById("app");
if (app) {
  app.innerHTML = samples
    .map(
      (s) =>
        `<div style="margin-bottom: 1rem;">
          <h2>${s.title}</h2>
          <p>${s.description}</p>
          <div id="sample-${s.id}"></div>
        </div>`
    )
    .join("");

  samples.forEach((s) => {
    const container = document.getElementById(`sample-${s.id}`);
    if (container) {
      const el = document.createElement(s.elementTag);
      container.appendChild(el);
    }
  });
}
