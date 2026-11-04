// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoGenerate } from "../elements/index.js";
import { addGenerated, systems as model } from "../model/index.js";
import { define, on } from "../../page/view/index.js";
import { systems } from "./constant.systems.js";

/** Generating on the page within `root`: its buttons add many todos at once. */
export const generatePlugin: Plugin<"root"> = {
    systems: [...model, ...systems],
    connect: (world, { root }) => {
        define({ "todo-generate": TodoGenerate });
        return on(root, "todo-generate", event => void world.run(addGenerated, { count: event.detail.count }));
    },
};

declare module "@adobe/ecs" {
    interface PluginConfig {
        /** The page's element holding the app's markup, whose events the plugins listen for. */
        root: HTMLElement;
    }
}
