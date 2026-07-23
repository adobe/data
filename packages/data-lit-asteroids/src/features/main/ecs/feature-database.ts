// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The feature's assembled database, aliased once so consumers (ui/, the app
// entry, ecs/conformance/) never name the topmost layer. Add or drop a layer →
// change only this line.
export { SystemDatabase as FeatureDatabase } from "./system-database/system-database.js";
