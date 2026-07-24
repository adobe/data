// © 2026 Adobe. MIT License. See /LICENSE for details.
import { render } from "lit";
import { Hopper } from "./index.js";

// Mount the top-level element through its lazy wrapper (no side-effect import).
const app = document.getElementById("app");
if (app) render(Hopper(), app);
