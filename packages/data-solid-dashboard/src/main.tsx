// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "solid-js/web";
import { App } from "./features/main/ui/app/app.jsx";

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
