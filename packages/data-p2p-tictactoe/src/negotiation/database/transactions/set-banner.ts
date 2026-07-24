// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const setBanner = (
  t: CoreDatabase.Store,
  { text, error = false }: { text: string; error?: boolean },
) => {
  t.resources.bannerText = text;
  t.resources.bannerError = error;
};
