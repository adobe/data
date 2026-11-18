// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { order } from "./persistent.component.order.js";
import { todo } from "./persistent.component.todo.js";

/** Every todo, in list order. */
export const ordered = Index.create({ key: [order], sorted: true, components: { with: [todo] } });
