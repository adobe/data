// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const setOfferCode = (t: CoreDatabase.Store, { code }: { code: string }) => {
  t.resources.offerCode = code;
  t.resources.bannerText = "";
};
