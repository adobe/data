// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Input } from "../../data/values/input/input.js";
import type { ServiceDatabase } from "../services/service-database.js";

// Record the player's intent; the systems read it each frame.
export const setInput = (db: ServiceDatabase, input: Input) => {
  db.transactions.setInput(input);
};
