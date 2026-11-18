// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { shown } from "./internal/constant.shown.js";
import type { Attached } from "./internal/type.attached.js";

/**
 * Records on `element` the entity it shows, for events from it, and returns it: where it's made for that entity, or
 * given it when reused.
 */
export const attach = <E extends Element>(element: E, entity: Entity): E & Attached => Object.assign(element, { [shown]: entity });
