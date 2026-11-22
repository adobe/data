// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin, World } from "@adobe/ecs";
import { setLayer } from "../../materials/model/index.js";
import { clearSelection } from "../../selection/model/index.js";
import { currentLayer, deleteSelection, extrudeSelection, paintSelection } from "../model/index.js";
import { on, root } from "../../../view/index.js";
import { bindLayer } from "./plugin.edit-view/system.bind-layer.js";

/**
 * The toolbar's edit buttons within the app's root, each `[data-edit]`: extrude, or paint, delete, or take paint off,
 * clear the selection, and switch between building and painting, which the root's `data-layer` shows.
 */
export const editView: Plugin<typeof root> = {
    systems: [bindLayer],
    connect: (world, { [root]: page }) => on(page, "click", event => {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>("[data-edit]")?.dataset["edit"];
        if (action === "extrude") void editAtSelection(world, true);
        else if (action === "delete") void editAtSelection(world, false);
        else if (action === "clear") void world.run(clearSelection);
        else if (action === "switch-layer") void world.run(setLayer, { layer: null });
    }),
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
