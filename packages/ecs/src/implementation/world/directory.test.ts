import { describe, expect, it } from "vitest";
import { Resource } from "../../interface/resource/resource.js";
import { indexOf, reserve } from "./entities.js";
import { recordFlags, recordStorages, recordWords, resourceEntityWord, resourceFlag, storageColumn, storageComponent, storageWords, structureWord, tableOffsetWord } from "./layout-directory.js";
import { ensureResources } from "./resources.js";
import { createState, idOf } from "./state.js";
import { applySync, prepareSync } from "./synchronize.js";

const gravity = Symbol("directoryTest/gravity");
declare module "@adobe/ecs" {
    export interface Resources {
        [gravity]: { type: number };
    }
}
Resource.register(gravity, { type: { type: "number", default: -9.8 } });

describe("the layout directory", () => {
    it("keeps the structure epoch odd from a sync point's start until its directory writes, and even otherwise, once a thread may read it", () => {
        const state = createState(true);
        const words = new Int32Array(state.memory.memory.buffer, 0, 16);
        expect(words[structureWord]).toBe(0);
        // No joined thread reads it, so a sync point leaves it.
        reserve(state.entities);
        expect(prepareSync(state)).toBe(true);
        expect(words[structureWord]).toBe(0);
        applySync(state);
        expect(words[structureWord]).toBe(0);
        if (state.directory !== null) state.directory.guarded = true;
        // Nothing to apply leaves it.
        expect(prepareSync(state)).toBe(false);
        expect(words[structureWord]).toBe(0);
        reserve(state.entities);
        expect(prepareSync(state)).toBe(true);
        expect(words[structureWord]).toBe(1);
        applySync(state);
        expect(words[structureWord]).toBe(2);
    });
    it("records the resource archetype, flagged, and the resource entity, so other threads find resources' cells", () => {
        const state = createState(true);
        const words = new Uint32Array(state.memory.memory.buffer);
        expect(words[resourceEntityWord]).toBe(0);
        ensureResources(state, [gravity]);
        const index = words[resourceEntityWord] - 1;
        expect(index).toBe(indexOf(state.resourceEntity));
        const archetype = state.entities.archetype[index];
        const record = words[words[tableOffsetWord] / 4 + archetype] / 4;
        expect(words[record + recordFlags]).toBe(resourceFlag);
        const storages = Array.from({ length: words[record + recordStorages] }, (_, s) => record + recordWords + s * storageWords);
        const storage = storages.find(base => words[base + storageComponent] === idOf(state, gravity));
        if (storage === undefined) throw new Error("No storage for gravity.");
        const row = state.entities.row[index];
        expect(new Float64Array(state.memory.memory.buffer, words[storage + storageColumn], row + 1)[row]).toBe(-9.8);
    });
});
