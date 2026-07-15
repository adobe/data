// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "./entity.js";

export const isNonPersistent = (entity: Entity): boolean => entity < 0;
export const isPersistent = (entity: Entity): boolean => entity >= 0;
