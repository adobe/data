// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe } from "./ui/tictactoe-app/tictactoe-app.js";
import { ServiceDatabase } from "./ecs/service-database.js";

const app = document.getElementById("app");
if (app) {
    // The agent database extends the base game with AI services. Built once
    // here and passed to the lazy wrapper so the upgraded element receives
    // the agent-extended database.
    const service = Database.create(ServiceDatabase.plugin);
    render(Tictactoe({ service }), app);
}
