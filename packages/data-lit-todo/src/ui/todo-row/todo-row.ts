// © 2026 Adobe. MIT License. See /LICENSE for details.
import { html, type TemplateResult } from "lit";
import type { Entity } from "@adobe/data/ecs";

export const TodoRow = (args: {
  entity: Entity;
  index: number;
}): TemplateResult => {
  void import("./todo-row-element.js");
  return html`<todo-row
    .entity=${args.entity}
    .index=${args.index}
  ></todo-row>`;
};
