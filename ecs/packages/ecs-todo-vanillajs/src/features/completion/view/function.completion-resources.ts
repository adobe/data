// © 2026 Adobe. MIT License. See /LICENSE for details.
import { summary } from "./shared/resource.summary.js";
import { toggleAllBox } from "./shared/resource.toggle-all-box.js";

/** The page's summary and toggle-all checkbox, found within `root`, as the resources its systems read them from. */
export const completionResources = (root: ParentNode) => ({ [summary]: root.querySelector("todo-summary"), [toggleAllBox]: root.querySelector("todo-toggle-all") });
