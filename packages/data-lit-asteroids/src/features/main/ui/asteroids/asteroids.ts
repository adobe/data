// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, type TemplateResult } from "lit";
import type { SystemDatabase } from "../../ecs/system-database/system-database.js";

/**
 * Public lazy wrapper for the Asteroids game element. Dynamically imports the
 * element file on first call (browser dedupes; Lit upgrades once registered)
 * and injects the live database through the `.service` DI seam.
 *
 * Generic over `S` so a database built from any plugin that extends
 * `SystemDatabase` (e.g. one that adds presence or AI) can be injected; the
 * element itself is typed on the minimal `SystemDatabase` surface.
 */
export const Asteroids = <S extends SystemDatabase>(args: { service: S }): TemplateResult => {
  void import("./asteroids-element.js");
  return html`<asteroids-game .service=${args.service}></asteroids-game>`;
};
