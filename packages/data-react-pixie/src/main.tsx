// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createRoot } from "react-dom/client";
import { Container, Graphics, Sprite } from "pixi.js";
import { extend } from "@pixi/react";
import { App } from "./App.jsx";

// Register PixiJS components for @pixi/react (pixiSprite, pixiContainer)
extend({ Container, Graphics, Sprite });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
