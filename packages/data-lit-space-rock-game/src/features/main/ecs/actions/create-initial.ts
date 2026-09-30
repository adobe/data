// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { ServiceDatabase } from "../services/service-database.js";

// Start a fresh game on a `bounds`-sized field.
export const createInitial = (db: ServiceDatabase, { bounds }: { readonly bounds: Vec2 }) => {
  db.transactions.createInitial({ bounds });
};
