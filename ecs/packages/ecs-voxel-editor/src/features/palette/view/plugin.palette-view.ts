// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, type Plugin } from "@adobe/ecs";
import { editModel } from "../../instances/model/index.js";
import { libraryAccess } from "../../library/model/index.js";
import { PalettePanel } from "../elements/index.js";
import { modelOfName, paintWith, pickItem, setPaletteFilter, toggleFavorite, type PaletteFilter } from "../model/index.js";
import { all, define, on, root } from "../../../view/index.js";
import { bindPalettePanel } from "./plugin.palette-view/system.bind-palette-panel.js";
import { findPalettePanel } from "./plugin.palette-view/system.find-palette-panel.js";

/**
 * The palette within the app's root: picking what to fill with, a library file's model brought into the document first;
 * favorites; editing a model alone, by double-clicking it; opening a library file; and filtering.
 */
export const paletteView: Plugin<typeof root | typeof libraryAccess> = {
    systems: [findPalettePanel, bindPalettePanel],
    connect: (world, { [root]: page, [libraryAccess]: access }) => {
        define({ "palette-panel": PalettePanel });
        return all(
            on(page, "palette-pick", event => {
                const { key } = event.detail;
                if (!key.startsWith("file:")) {
                    void world.run(pickItem, { key });
                    return;
                }
                void access.reference(key.slice("file:".length)).then(model => model === Entity.none ? undefined : world.run(paintWith, { model }));
            }),
            on(page, "palette-favorite", event => void world.run(toggleFavorite, { key: event.detail.key })),
            on(page, "palette-edit", event => {
                void world.run(modelOfName, { name: event.detail.key.slice("model:".length) }).then(model => model === Entity.none ? undefined : world.run(editModel, { model }));
            }),
            on(page, "palette-open", event => void access.open(event.detail.key.slice("file:".length))),
            on(page, "palette-filter", event => {
                const { kind, size, search } = event.detail;
                const filter: PaletteFilter = {
                    kind: kind === "materials" || kind === "models" ? kind : "all",
                    size: size === "small" || size === "medium" || size === "large" ? size : "any",
                    search,
                };
                void world.run(setPaletteFilter, filter);
            }),
        );
    },
};
