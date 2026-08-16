// © 2026 Adobe. MIT License. See /LICENSE for details.
export * from "./table.js";
export * from "./create-table.js";
export * from "./update-row.js";
export * from "./add-row.js";
export * from "./delete-row.js";
export * from "./ensure-capacity.js";
export * from "./copy-column-to-gpu-buffer.js";
// NOTE: `get-row-data.js` is intentionally NOT re-exported here. `getRowData`
// returns the WHOLE row including the internal `id` column and is an
// implementation detail of archetype migration/serialization; ECS reads must
// go through the id-excluding reader instead. Import it directly from
// "./get-row-data.js" where an internal full-row copy is genuinely needed.
