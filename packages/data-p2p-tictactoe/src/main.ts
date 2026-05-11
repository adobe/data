// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { P2pApp } from "./elements/p2p-app/p2p-app.js";

const app = document.getElementById("app");
if (app) {
    render(P2pApp(), app);
}
