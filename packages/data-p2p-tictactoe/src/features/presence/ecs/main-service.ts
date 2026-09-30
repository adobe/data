// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The assembled presence feature database. Its topmost layer is `action-database`
// (adds the presence actions). Every consumer references `MainService`,
// never the topmost layer. Combined onto the game database at the app shell.
export { ActionDatabase as MainService } from "./actions/action-database.js";
