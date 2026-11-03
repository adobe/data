// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, type World } from "../index.js";

declare module "@adobe/ecs" {
    interface PluginConfig {
        target: EventTarget;
    }
}

const listening: Plugin<"target"> = { systems: [], connect: () => () => {} };

export const startWithoutTarget = (world: World): Disposable =>
    // @ts-expect-error: the config leaves out target. Without this line, TypeScript reports:
    // Property 'target' is missing in type '{}' but required in type 'Pick<PluginConfig, "target">'.
    Plugin.start(world, [listening], {});
