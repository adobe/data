// © 2026 Adobe. MIT License. See /LICENSE for details.
// `name` and `assignees` are re-exported from main by identity (the SAME schema
// objects) so that when main imports this feature's schema plugin,
// `combinePlugins` dedupes them — one shared column.
export * from "./user.js";
export { name, assignees } from "../../../../main/ecs/document-database/components/index.js";
