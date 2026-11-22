// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editing, mainModel, parent } from "../../voxels/model/index.js";
import { SelectedFace } from "./archetype.selected-face.js";
import { faceCell } from "./component.face-cell.js";
import { faceSide } from "./component.face-side.js";
import { faces } from "./index.faces.js";
import { keyOf } from "./internal/function.key-of.js";
import { namedSelections } from "./resource.named-selections.js";

/**
 * Selects the main model's faces saved under a name, in place of its selection or, with `add`, beside it; nothing for a
 * name not saved, or while another model is being edited.
 */
export const restoreSelection: System<{ readonly name: string; readonly add: boolean }> = System.create({
    lookup: { faces: { index: faces } },
}, ({ lookup, resources, commands }, input: { readonly name: string; readonly add: boolean }) => {
    const main = resources[mainModel];
    const saved = resources[namedSelections]?.get(input.name);
    if (saved === undefined || (resources[editing]?.model ?? main) !== main) return;
    const selected = lookup.faces(main);
    const present = new Set<string>();
    for (let i = 0; i < selected.length; i++) {
        const row = selected.at(i);
        if (input.add) present.add(keyOf({ cell: row[faceCell], side: row[faceSide] }));
        else commands.despawn(row.entity);
    }
    const spawn = commands.spawn(SelectedFace);
    for (const [x, y, z, side] of saved) {
        if (present.has(keyOf({ cell: [x, y, z], side }))) continue;
        spawn({ [parent]: main, [faceCell]: [x, y, z], [faceSide]: side });
    }
});
