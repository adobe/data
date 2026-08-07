// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";
import type { Database } from "@adobe/data/ecs";
import type { MainService } from "../../services/main-service/main-service.js";

type TodoService = Database.Plugin.ToDatabase<typeof MainService.plugin>;

/**
 * Generic over `S` so callers may pass a database built from any plugin
 * that extends the todo plugin. The element is typed on the minimal
 * `MainService` surface.
 */
export const TodoApp = <S extends TodoService>(args: { service: S }): TemplateResult => {
  void import("./todo-app-element.js");
  return html`<todo-app .service=${args.service}></todo-app>`;
};
