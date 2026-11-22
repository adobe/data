// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { layer, type Layer } from "../../materials/model/index.js";

/** The mode editing is in, so input can do what it means there. */
export const currentLayer: System<void, Layer> = System.create({ readonly: true }, ({ resources }) => resources[layer]);
