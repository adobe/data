// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { namedSelections } from "../../model/index.js";
import { selectionNames } from "./resource.selection-names.js";

/** Writes the saved selections' names to the list, as they change. */
export const bindSelectionNames: System = System.create({
    readonly: true,
    resources: { is: [selectionNames], changed: [selectionNames, namedSelections] },
}, ({ resources }) => {
    resources[selectionNames].names = [...resources[namedSelections]?.keys() ?? []].sort((a, b) => a.localeCompare(b));
});
