// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const startJoinSignaling = (t: CoreDatabase.Store) => {
  t.resources.phase = "join-signaling";
  t.resources.role = "joiner";
  t.resources.connection = "connecting";
  t.resources.bannerText = "";
  t.resources.bannerError = false;
};
