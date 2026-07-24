// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const generateAnswer = (db: ServiceDatabase) =>
  db.services.negotiation.generateAnswer();
