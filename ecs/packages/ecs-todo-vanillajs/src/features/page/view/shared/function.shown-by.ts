// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/ecs";
import { shown } from "./constant.shown.js";
import type { Attached } from "./type.attached.js";

/** The entity a target shows, or none for one that shows none. */
export const shownBy = (target: EventTarget | Attached | null): Entity => target !== null && shown in target ? target[shown] : Entity.none;
