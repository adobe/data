// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Database } from "@adobe/data/ecs";
import { definitions } from "./voxel-shape-definitions.js";
import { serializeVoxelShapeFile } from "./voxel-shape-file.js";
import { voxelShapeLoader } from "./voxel-shape-loader-plugin.js";

const testLoader = Database.Plugin.create({
    extends: voxelShapeLoader,
    archetypes: {
        NamedShape: ["voxelShapeName"],
    },
    transactions: {
        insertNamedShape(t, args: { name: string }) {
            return t.archetypes.NamedShape.insert({ voxelShapeName: args.name });
        },
    },
});

type LoaderStore = {
    resources: {
        _voxelShapeBaseUrl: string;
        _voxelShapeByName: Map<string, number> | null;
    };
    get(id: number, component: "voxelShape"): number | undefined;
};

describe("voxelShapeLoader", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("resolvePendingVoxelShapes attaches voxelShape when name is registered", () => {
        const db = Database.create(testLoader);
        const store = db as unknown as { store: LoaderStore };
        const id = db.transactions.insertNamedShape({ name: "stairStep" });
        expect(store.store.get(id, "voxelShape")).toBeUndefined();

        db.transactions.registerVoxelShapeFromVolume({
            name: "stairStep",
            volume: definitions.stairStep(),
        });
        db.transactions.resolvePendingVoxelShapes();

        const mesh = store.store.get(id, "voxelShape");
        expect(mesh).toBeDefined();
        expect(store.store.resources._voxelShapeByName?.get("stairStep")).toBe(mesh);
    });

    it("fetches JSON from _voxelShapeBaseUrl and resolves pending bodies", async () => {
        const stairJson = serializeVoxelShapeFile(definitions.stairStep());
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => ({
                ok: url.endsWith("/stairStep.json"),
                json: async () => stairJson,
            })),
        );

        const db = Database.create(testLoader);
        const store = db as unknown as { store: LoaderStore };
        store.store.resources._voxelShapeBaseUrl = "/shapes/";
        const id = db.transactions.insertNamedShape({ name: "stairStep" });

        db.system.functions.voxelShapeLoadSystem?.();
        await vi.waitFor(() => {
            expect(store.store.get(id, "voxelShape")).toBeDefined();
        });
    });

    it("registerVoxelShapeFromVolume deduplicates by volume content", () => {
        const db = Database.create(testLoader);
        const volume = definitions.lCorner();
        const a = db.transactions.registerVoxelShapeFromVolume({ name: "lCorner", volume });
        const b = db.transactions.registerVoxelShapeFromVolume({ name: "lCorner", volume });
        expect(a).toBe(b);
    });
});
