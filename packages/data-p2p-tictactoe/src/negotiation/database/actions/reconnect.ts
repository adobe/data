// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const reconnect = (db: ServiceDatabase) => db.services.negotiation.reconnect();
