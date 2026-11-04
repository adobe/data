// © 2026 Adobe. MIT License. See /LICENSE for details.
import { list } from "./resource.list.js";

/** The page's list, found within `root`, as the resource its systems read it from. */
export const todosResources = (root: ParentNode) => ({ [list]: root.querySelector("todo-list") });
