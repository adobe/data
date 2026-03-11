// © 2026 Adobe. MIT License. See /LICENSE for details.

import "./elements/tictactoe-app/tictactoe-app.js";

const app = document.getElementById("app");
if (app) {
  const el = document.createElement("tictactoe-app");
  app.appendChild(el);
}
