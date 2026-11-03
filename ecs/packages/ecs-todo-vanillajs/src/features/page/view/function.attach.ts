// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import { type Attached, shown } from "./shared/shown.js";

/**
 * Records on `element` the entity it shows, for events from it, where the element is made for that entity, and
 * returns it. Elements are never reused, so it's written once and lives as long as the element.
 */
export const attach = <E extends Element>(element: E, entity: Entity): E & Attached => Object.assign(element, { [shown]: entity });
