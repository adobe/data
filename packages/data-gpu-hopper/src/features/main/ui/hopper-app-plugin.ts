// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { FeatureDatabase } from "../ecs/feature-database.js";
import { HopperRenderDatabase } from "./render/hopper-render-plugin.js";

// The browser application: the headless simulation (`FeatureDatabase`) plus the
// GPU renderer combined on top. `combine` dedupes the shared `scheduler` and the
// shared `CoreDatabase` schema by identity, so there is one store and one frame
// loop. The headless tests keep using `FeatureDatabase` alone.
const hopperAppPlugin = Database.Plugin.combine(FeatureDatabase.plugin, HopperRenderDatabase.plugin);

export type HopperApp = Database.Plugin.ToDatabase<typeof hopperAppPlugin>;

export namespace HopperApp {
  export const plugin = hopperAppPlugin;
}
