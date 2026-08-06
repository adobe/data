// © 2026 Adobe. MIT License. See /LICENSE for details.

// The assembled feature database — the sole entrypoint the `ui/` binds to.
// Transactions are the topmost layer this feature builds (no computed / service
// / action / system layers), so `TransactionDatabase` is `MainService`. Adding
// or dropping a layer changes only this one line; consumers name `MainService`.
export { TransactionDatabase as MainService } from "./transaction-database/transaction-database.js";
