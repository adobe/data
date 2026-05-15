// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { SampleContainer } from "./sample-container/sample-container.js";

const app = document.getElementById("app");
if (app) {
    render(SampleContainer(), app);
}
