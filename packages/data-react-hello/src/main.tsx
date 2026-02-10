// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
