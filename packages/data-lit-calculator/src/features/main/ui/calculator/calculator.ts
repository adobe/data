// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { ComputedDatabase } from "../../ecs/computed-database/computed-database.js";

type CalculatorService = ComputedDatabase;

/**
 * The public, lazy entry point for the calculator UI. Generic over `S` so a
 * caller may inject a database built from any plugin that extends the base
 * calculator database; the element itself consumes only the minimal
 * `ComputedDatabase` surface.
 */
export const Calculator = <S extends CalculatorService>(args: { service: S }): TemplateResult => {
  void import("./calculator-element.js");
  return html`<adobe-calculator .service=${args.service}></adobe-calculator>`;
};
