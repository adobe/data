// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { faceCell, faces, faceSide } from "../../../selection/model/index.js";
import { instanceOf, instancesIn, mainModel, material, models, paint, paintedFaces, parent, position, rotation, size, voxels } from "../../../voxels/model/index.js";
import { snapshotOf } from "./function.snapshot-of.js";
import { history } from "../resource.history.js";

/**
 * Records each change to the models' sizes, voxels, instances or selection, on the tick after it, as a step undo returns to, and leaves
 * nothing to redo. Changes to the selection alone, one after another, are one step, so a drag over many ticks, or
 * selecting face after face, is undone at once; any other change is always a step of its own. A new document starts a
 * new history.
 */
export const recordHistory: System = System.create({
    lookup: { models: { index: models }, voxels: { index: voxels }, faces: { index: faces }, instances: { index: instancesIn } },
}, ({ lookup, resources }) => {
    const shown = lookup.voxels();
    const placed = lookup.instances();
    const selected = lookup.faces();
    const all = lookup.models();
    const now = snapshotOf(resources[mainModel], {
        models: { length: all.length, at: i => { const row = all.at(i); return { model: row.entity, size: row[size] }; } },
        voxels: { length: shown.length, at: i => { const row = shown.at(i); return { cell: row[position], material: row[material], paint: row[paint], painted: row[paintedFaces], parent: row[parent] }; } },
        instances: { length: placed.length, at: i => { const row = placed.at(i); return { of: row[instanceOf], parent: row[parent], position: row[position], rotation: row[rotation] }; } },
        faces: { length: selected.length, at: i => { const row = selected.at(i); return { parent: row[parent], cell: row[faceCell], side: row[faceSide] }; } },
    });
    const current = resources[history];
    if (current === null || current.last.main !== now.main) {
        resources[history] = { undo: [], redo: [], last: now };
        return;
    }
    const before = current.last;
    if (now.contentKey === before.contentKey && now.faceKey === before.faceKey) return;
    const selectionOnly = now.contentKey === before.contentKey;
    const latest = current.undo.at(-1);
    // Selection changes since the last step that was one, with nothing undone between, join it.
    const joins = selectionOnly && latest?.selectionOnly === true && current.redo.length === 0;
    const undo = joins ? current.undo : [...current.undo, { snapshot: before, selectionOnly }].slice(-limit);
    resources[history] = { undo, redo: [], last: now };
});

/** The most steps kept to undo. */
const limit = 200;
