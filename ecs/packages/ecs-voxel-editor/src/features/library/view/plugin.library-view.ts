// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { LibraryBar } from "../elements/index.js";
import { libraryAccess } from "../model/index.js";
import { define, on, root } from "../../../view/index.js";
import { bindLibraryBar } from "./plugin.library-view/system.bind-library-bar.js";
import { findLibraryBar } from "./plugin.library-view/system.find-library-bar.js";
import { libraryState } from "./plugin.library-view/system.library-state.js";

/**
 * The library bar within the app's root: where the document is, and what last happened. Clicking its folder chooses
 * one, or reconnects one that needs it.
 */
export const libraryView: Plugin<typeof root | typeof libraryAccess> = {
    systems: [findLibraryBar, bindLibraryBar],
    connect: (world, { [root]: page, [libraryAccess]: access }) => {
        define({ "library-bar": LibraryBar });
        return on(page, "library-folder", () => void world.run(libraryState).then(state => state === "permission" ? access.reconnect() : access.choose()));
    },
};
