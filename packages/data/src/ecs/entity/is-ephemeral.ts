// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "./entity.js";

export const isEphemeral = (entity: Entity): boolean => entity < 0;
