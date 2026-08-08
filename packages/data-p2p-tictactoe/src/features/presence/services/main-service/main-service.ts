// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The assembled presence feature database. Its topmost layer is `action-database`
// (adds the `trackPresence` action). Every consumer references `MainService`,
// never the topmost layer. Combined onto the game database at the app shell.
export { ActionDatabase as MainService } from "./action-database/action-database.js";
