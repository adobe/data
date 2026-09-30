// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { MainService } from "../features/main/ecs/main-service.js";
import { CoreDatabase as AssignCoreDatabase } from "../features/assign/ecs/core/core-database.js";

// The app's composed schema: main's full behavior, plus assign's schema `imports`ed
// so the store knows its columns up front (its data persists and loads) while its
// behavior loads lazily when an assign element connects. Base features never name
// the features built on them; this is the one place they are composed.
const appSchemaPlugin = Database.Plugin.create({
  imports: AssignCoreDatabase.plugin,
  extends: MainService.plugin,
});

export namespace AppSchema {
  export const plugin = appSchemaPlugin;
}
