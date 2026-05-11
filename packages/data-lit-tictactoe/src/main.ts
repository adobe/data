// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe } from "./elements/tictactoe-app/tictactoe-app.js";
import { agentPlugin } from "./state/agent-plugin.js";

const app = document.getElementById("app");
if (app) {
    // The agent plugin extends tictactoePlugin with AI services. Built once
    // here and passed to the lazy wrapper so the upgraded element receives
    // the agent-extended database.
    const service = Database.create(agentPlugin);
    render(Tictactoe({ service }), app);
}
