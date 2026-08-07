// © 2026 Adobe. MIT License. See /LICENSE for details.

// The assembled feature database — the sole entrypoint the `ui/` binds to.
// Actions are the topmost layer this feature builds (no computed / service /
// system layers), so `ActionDatabase` is `MainService`. Adding or dropping a
// layer changes only this one line; consumers name `MainService`.
export { ActionDatabase as MainService } from "./action-database/action-database.js";
