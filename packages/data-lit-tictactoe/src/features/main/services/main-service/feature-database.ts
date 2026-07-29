// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The assembled feature database. Its topmost layer is `service-database`
// (adds the AI agent services). Every consumer — `ui/`, the app entry,
// `ecs/conformance/` — references `FeatureDatabase`, never the topmost layer,
// so adding or dropping a layer changes only this one line.
export { ServiceDatabase as FeatureDatabase } from "./service-database/service-database.js";
