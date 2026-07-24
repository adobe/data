// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const dispose = (db: ServiceDatabase) => db.services.negotiation.dispose();
