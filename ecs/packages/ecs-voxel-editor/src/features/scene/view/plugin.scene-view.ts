// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { Frame, Surface, Target } from "@adobe/ecs-gpu";
import { root } from "../../../view/index.js";
import { addSlots } from "./plugin.scene-view/system.add-slots.js";
import { aimView } from "./plugin.scene-view/system.aim-view.js";
import { bindDrawList } from "./plugin.scene-view/system.bind-draw-list.js";
import { bindMaterialTable } from "./plugin.scene-view/system.bind-material-table.js";
import { refreshMaterialTable } from "./plugin.scene-view/system.refresh-material-table.js";
import { drawScene } from "./plugin.scene-view/system.draw-scene.js";
import { drawSelection } from "./plugin.scene-view/system.draw-selection.js";
import { spawnView } from "./plugin.scene-view/system.spawn-view.js";
import { updateSlots } from "./plugin.scene-view/system.update-slots.js";

/**
 * The scene, drawn with WebGPU on the page's `canvas.scene` within the app's root, in a world with a `gpuDevice`: the
 * canvas moved to a surface the world presents to, sized as it's laid out, with a view of the whole of it aimed through
 * the camera, drawn each frame the world ticks.
 */
export const sceneView: Plugin<typeof root> = {
    systems: [bindMaterialTable, refreshMaterialTable, addSlots, updateSlots, bindDrawList, aimView, Frame.systems, drawScene, drawSelection],
    connect: (world, { [root]: page }) => {
        const canvas = page.querySelector<HTMLCanvasElement>("canvas.scene");
        if (canvas === null) return () => {};
        let stop = (): void => {};
        let stopped = false;
        const attach = async (): Promise<void> => {
            const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
            const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
            const target: Target.Options = { ...Target.Options.default, sampleCount: 4, clear: [0, 0, 0, 1] };
            const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width, height, target });
            if (stopped) return;
            stop = Surface.observe(canvas, world, surface);
            await world.run(spawnView, { surface });
        };
        attach().catch(reportError);
        return () => {
            stopped = true;
            stop();
        };
    },
};
