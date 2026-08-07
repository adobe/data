// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The assembled feature database. Its topmost layer is `action-database`
// (adds the async app-facing actions). Every consumer — `ui/`, the app entry,
// `services/main-service/conformance/` — references `FeatureDatabase`, never the
// topmost layer, so adding or dropping a layer changes only this one line.
export { ActionDatabase as FeatureDatabase } from "./action-database/action-database.js";
