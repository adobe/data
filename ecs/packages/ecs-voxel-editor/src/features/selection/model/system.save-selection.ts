// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { mainModel } from "../../voxels/model/index.js";
import { faceCell } from "./component.face-cell.js";
import { faceSide } from "./component.face-side.js";
import { faces } from "./index.faces.js";
import { namedSelections } from "./resource.named-selections.js";

/** Saves the main model's selection under a name, replacing any saved under it; a blank name saves nothing. */
export const saveSelection: System<{ readonly name: string }> = System.create({
    lookup: { faces: { index: faces } },
}, ({ lookup, resources }, input: { readonly name: string }) => {
    const name = input.name.trim();
    if (name === "") return;
    const selected = lookup.faces(resources[mainModel]);
    const kept: [number, number, number, number][] = [];
    for (let i = 0; i < selected.length; i++) {
        const [x, y, z] = selected.at(i)[faceCell];
        kept.push([x, y, z, selected.at(i)[faceSide]]);
    }
    resources[namedSelections] = new Map([...resources[namedSelections] ?? [], [name, kept]]);
});
