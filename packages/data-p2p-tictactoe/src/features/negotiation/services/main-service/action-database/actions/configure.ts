// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NegotiationConfig } from "../../service-database/services/create-connection-service.js";
import type { ServiceDatabase } from "../../service-database/service-database.js";

export const configure = (db: ServiceDatabase, config: NegotiationConfig) =>
  db.services.connection.configure(config);
