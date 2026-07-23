// © 2026 Adobe. MIT License. See /LICENSE for details.

import { render } from "lit";
import { Database } from "@adobe/data/ecs";
import { Asteroids } from "./features/main/ui/asteroids/asteroids.js";
import { FeatureDatabase } from "./features/main/ecs/feature-database.js";

const app = document.getElementById("app");
if (app) {
  // The live Asteroids database (schema + indexes + transactions + computed,
  // combined with the built-in rAF scheduler). Built once here and passed to
  // the lazy wrapper via its `.service` seam so the upgraded element receives
  // the ticking database.
  const service = Database.create(FeatureDatabase.plugin);
  render(Asteroids({ service }), app);
}
