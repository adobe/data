// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { addPosition } from "./systems/system.add-position.js";
import { removePosition } from "./systems/system.remove-position.js";

/** `BM_RemoveAddComponent`: component one removed from each entity, then added back, each at a sync point. */
export const removeAddComponent: System = System.create([removePosition, addPosition]);
