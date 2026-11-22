// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, World, workers } from "@adobe/ecs";
import { Device } from "@adobe/ecs-gpu";
import { cameraModel, frameWorld } from "../../camera/model/index.js";
import { cameraPorts } from "../../camera/ports/index.js";
import { editPorts } from "../../edit/ports/index.js";
import { editView } from "../../edit/view/index.js";
import { fileView } from "../../file/view/index.js";
import { historyModel } from "../../history/model/index.js";
import { historyPorts } from "../../history/ports/index.js";
import { historyView } from "../../history/view/index.js";
import { instancesPorts } from "../../instances/ports/index.js";
import { instancesView } from "../../instances/view/index.js";
import { libraryAccess } from "../../library/model/index.js";
import { createLibraryAccess } from "../../library/ports/index.js";
import { libraryView } from "../../library/view/index.js";
import { seedMaterials } from "../../materials/model/index.js";
import { materialsView } from "../../materials/view/index.js";
import { palettePorts } from "../../palette/ports/index.js";
import { paletteView } from "../../palette/view/index.js";
import { sceneView } from "../../scene/view/index.js";
import { sizingView } from "../../sizing/view/index.js";
import { selectionPorts } from "../../selection/ports/index.js";
import { selectionView } from "../../selection/view/index.js";
import { thumbnailsView } from "../../thumbnails/view/index.js";
import { newDocument } from "../../voxels/model/index.js";
import { surface } from "../../../ports/index.js";
import { root } from "../../../view/index.js";
import type { App } from "./function.create-app/type.app.js";

/**
 * Starts the editor on the page within `element`, whose `canvas.scene` the scene is drawn on with WebGPU: a new document
 * whose main model is 16 voxels a side, each a world unit across, with the standard materials, framed in view; the
 * library folder chosen before, if the browser still allows it; and every feature's views and ports. The world keeps a
 * GPU device, requesting another if it's lost; without WebGPU, the scene isn't drawn.
 */
export const createApp = async (element: HTMLElement): Promise<App> => {
    const canvas = element.querySelector<HTMLCanvasElement>("canvas.scene");
    if (canvas === null) throw new Error("The page has no canvas.scene.");
    const world = World.create({ [workers]: 0, [root]: element });
    const device = await Device.keep(world);
    const access = createLibraryAccess(world);
    const plugins = Plugin.start(world, [
        historyModel, cameraModel, thumbnailsView, sceneView, paletteView, materialsView, sizingView, fileView, libraryView, instancesView, selectionView, editView, historyView,
        cameraPorts, selectionPorts, instancesPorts, editPorts, historyPorts, palettePorts,
    ], { [root]: element, [surface]: canvas, [libraryAccess]: access });
    await world.run(newDocument, { size: [16, 16, 16], scale: [1, 1, 1] });
    await world.run(seedMaterials);
    await world.run(frameWorld);
    await access.restore();
    return {
        world,
        drawn: device.supplied,
        dispose: async () => {
            plugins[Symbol.dispose]();
            device.stop();
            await world.dispose();
        },
    };
};
