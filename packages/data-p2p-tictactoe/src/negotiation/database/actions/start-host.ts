// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../service-database.js";

export const startHost = (db: ServiceDatabase) => db.services.negotiation.startHost();
