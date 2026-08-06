// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The assembled feature database — the sole entrypoint the ui binds to. Aliased
// from the topmost layer so consumers reference `MainService` (`.plugin` /
// `.Store`) and never name that layer; add or drop a layer → change only this line.
export { SystemDatabase as MainService } from "./system-database/system-database.js";
