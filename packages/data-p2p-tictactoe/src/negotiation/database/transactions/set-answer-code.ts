// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

export const setAnswerCode = (t: CoreDatabase.Store, { code }: { code: string }) => {
  t.resources.answerCode = code;
  t.resources.bannerText = "";
};
