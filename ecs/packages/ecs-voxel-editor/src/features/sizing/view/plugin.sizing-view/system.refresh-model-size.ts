// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editing, model, size } from "../../../voxels/model/index.js";
import { modelSize } from "./resource.model-size.js";

/** Writes the edited model's size to the panel as it changes, as resizing, fitting or growing it does. */
export const refreshModelSize: System = System.create({
    readonly: true,
    resources: { is: [modelSize] },
    components: { with: [model, size], changed: [size] },
}, (row, { resources }) => {
    if (row.entity === resources[editing].model) resources[modelSize].size = [row[size][0], row[size][1], row[size][2]];
});
