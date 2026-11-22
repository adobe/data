// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin, World } from "@adobe/ecs";
import { setLayer } from "../../materials/model/index.js";
import { currentLayer, deleteSelection, extrudeSelection, paintSelection } from "../model/index.js";

/**
 * The editing keys: `+` extrudes the selection and `-` deletes under it, from either the main row or the numpad, or in
 * paint mode paints it and takes its paint off; `P` switches between building and painting.
 */
export const editPorts: Plugin = {
    systems: [],
    connect: world => {
        const key = (event: KeyboardEvent): void => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === "+" || event.key === "=") void editAtSelection(world, true);
            else if (event.key === "-" || event.key === "_") void editAtSelection(world, false);
            else if (event.code === "KeyP") void world.run(setLayer, { layer: null });
            else return;
            event.preventDefault();
        };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    },
};

/**
 * Adds at the selection, `add`, or takes away under it, as the mode means: building, extruding or deleting; painting,
 * painting the faces or taking their paint off, and extruding faces painted already.
 */
const editAtSelection = async (world: World, add: boolean): Promise<void> => {
    if (await world.run(currentLayer) === "paint") {
        // Painting faces painted already extrudes them, painted.
        if (!await world.run(paintSelection, { remove: !add }) && add) await world.run(extrudeSelection);
    } else if (add) await world.run(extrudeSelection);
    else await world.run(deleteSelection);
};
