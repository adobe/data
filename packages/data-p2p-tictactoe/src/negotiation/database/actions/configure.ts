// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { NegotiationConfig } from "../services/index.js";
import type { ServiceDatabase } from "../service-database.js";

export const configure = (db: ServiceDatabase, config: NegotiationConfig) =>
  db.services.negotiation.configure(config);
