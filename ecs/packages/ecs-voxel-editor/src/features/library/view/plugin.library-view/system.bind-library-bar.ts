// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { document } from "../../../document/model/index.js";
import { library } from "../../model/index.js";
import { libraryBar } from "./resource.library-bar.js";

/** Writes the library and the document's path to the bar, as either changes. */
export const bindLibraryBar: System = System.create({
    readonly: true,
    resources: { is: [libraryBar], changed: [libraryBar, library, document] },
}, ({ resources }) => {
    resources[libraryBar].library = resources[library];
    resources[libraryBar].document = resources[document].path;
});
