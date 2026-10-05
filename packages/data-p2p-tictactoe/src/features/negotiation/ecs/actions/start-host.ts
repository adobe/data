// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const startHost = (db: ServiceDatabase) => db.services.connection.startHost();
