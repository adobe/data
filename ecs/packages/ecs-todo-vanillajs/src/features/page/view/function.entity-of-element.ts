// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { shownBy } from "./shared/shown.js";

/** The entity an element shows, as `todo-move`'s `item` and `before` name them, or none for null or one that shows none. */
export const entityOfElement = (element: Element | null): Entity => shownBy(element);
