// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import "./elements/tictactoe-app/tictactoe-app.js";
import { agentPlugin } from "./state/agent-plugin.js";
import type { TictactoeApp } from "./elements/tictactoe-app/tictactoe-app.js";

const app = document.getElementById("app");
if (app) {
  // Create a database with the full agent plugin (adds AI services on top of
  // tictactoePlugin). Inject it explicitly before mounting so the element tree
  // receives the agent-extended surface rather than the base plugin surface.
  const db = Database.create(agentPlugin);
  const el = document.createElement("tictactoe-app") as TictactoeApp;
  el.service = db as any;
  app.appendChild(el);
}
