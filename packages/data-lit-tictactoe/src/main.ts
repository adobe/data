// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe } from "./elements/tictactoe-app/tictactoe-app.js";
import { AgentDatabase } from "./database/service-database.js";

const app = document.getElementById("app");
if (app) {
    // The agent database extends the base game with AI services. Built once
    // here and passed to the lazy wrapper so the upgraded element receives
    // the agent-extended database.
    const service = Database.create(AgentDatabase.plugin);
    render(Tictactoe({ service }), app);
}
