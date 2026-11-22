// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { editing } from "../../../voxels/model/index.js";

/** The model being edited, which the size panel sizes. */
export const modelOfEditing: System<void, Entity> = System.create({ readonly: true }, ({ resources }) => resources[editing].model);
