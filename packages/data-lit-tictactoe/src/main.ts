// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Tictactoe } from "./features/main/ui/tictactoe-app/tictactoe-app.js";
import { FeatureDatabase } from "./features/main/ecs/feature-database.js";

const app = document.getElementById("app");
if (app) {
    // The assembled feature database extends the base game with AI services.
    // Built once here and passed to the lazy wrapper so the upgraded element
    // receives the agent-extended database.
    const service = Database.create(FeatureDatabase.plugin);
    render(Tictactoe({ service }), app);
}
