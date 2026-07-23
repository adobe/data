// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Calculator } from "./features/main/ui/calculator/calculator.js";
import { ComputedDatabase } from "./features/main/ecs/computed-database/computed-database.js";

const app = document.getElementById("app");
if (app) {
  // The base calculator database (resources + transactions + computed). Built
  // once here and passed to the lazy wrapper via its `.service` seam so the
  // upgraded element receives the live database.
  const service = Database.create(ComputedDatabase.plugin);
  render(Calculator({ service }), app);
}
