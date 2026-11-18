// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoGenerate } from "../elements/index.js";
import { addGenerated } from "../model/index.js";
import { define, on, root } from "../../../../../view/index.js";

/** Generating on the page within the app's root: its buttons add many todos at once. */
export const generateView: Plugin<typeof root> = {
    systems: [],
    connect: (world, { [root]: page }) => {
        define({ "todo-generate": TodoGenerate });
        return on(page, "todo-generate", event => void world.run(addGenerated, { count: event.detail.count }));
    },
};
