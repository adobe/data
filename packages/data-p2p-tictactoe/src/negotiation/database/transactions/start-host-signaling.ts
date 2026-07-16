// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const startHostSignaling = (t: CoreDatabase.Store) => {
  t.resources.phase = "host-signaling";
  t.resources.role = "host";
  t.resources.connection = "connecting";
  t.resources.bannerText = "Generating invite code — please wait…";
  t.resources.bannerError = false;
};
