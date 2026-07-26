---
paths:
  - 'src/**/elements/**/*.ts'
  - 'src/**/ui/**/*.ts'
---

# Lazy Wrapper

A lazy element wrapper is a strongly typed function that emits a lit template and dynamically loads the actual element code to ensure no loading till first real usage.
Consumers of this element DO NOT use the <todo-row...> markup, instead they import this lazy function and call it with `{TodoRow({...})}`.

# Example from data-lit-todo

# todo-row.ts
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
