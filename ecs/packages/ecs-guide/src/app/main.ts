// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createApp } from "./app.js";

/** The guide's page: its markup holds the fixed elements, and the app's world drives them. */
const root = document.querySelector<HTMLElement>(".app");
if (root !== null) void createApp(root);
