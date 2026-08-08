// © 2026 Adobe. MIT License. See /LICENSE for details.
// The whole assembled feature database. Consumers (ui/, the app entry) reference
// `MainService` — never the topmost layer by name — so adding or dropping a
// behaviour layer changes only this one line.
export { SystemDatabase as MainService } from "./system-database/system-database.js";
