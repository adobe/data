// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { parseVoxelShapeFile } from "./voxel-shape-file.js";
import { insertVoxelShapeMesh } from "./voxel-shape-insert.js";
import { applyVoxelShapeResolve } from "./voxel-shape-resolve.js";
import { voxelShape } from "./voxel-shape-plugin.js";

const resolveShapeUrl = (baseUrl: string, name: string): string => {
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return `${base}${name}.json`;
};

/**
 * Loads `.json` voxel shapes from `_voxelShapeBaseUrl` when bodies carry
 * `voxelShapeName`. Resolves to `voxelShape` mesh entities once fetched.
 */
export const voxelShapeLoader = Database.Plugin.create({
    extends: voxelShape,
    resources: {
        _voxelShapeBaseUrl: { default: "/shapes/" as string },
        _voxelShapeLoadInFlight: { default: null as Set<string> | null, transient: true },
    },
    transactions: {
        registerVoxelShapeFromVolume(t, args: { name: string; volume: DenseVolume<boolean> }): Entity {
            const mesh = insertVoxelShapeMesh(t, { volume: args.volume });
            (t.resources._voxelShapeByName ??= new Map()).set(args.name, mesh);
            (t.resources._voxelSizeByName ??= new Map()).set(args.name, [...args.volume.size] as Vec3);
            return mesh;
        },
        resolvePendingVoxelShapes(t) {
            const byName = t.resources._voxelShapeByName;
            if (byName == null) return;
            const pending: { id: Entity; name: string }[] = [];
            for (const arch of t.queryArchetypes(
                ["voxelShapeName"],
                { exclude: ["voxelShape"] },
            )) {
                const ids = arch.columns.id;
                const names = arch.columns.voxelShapeName;
                for (let i = 0; i < arch.rowCount; i++) {
                    const name = names.get(i);
                    if (name) pending.push({ id: ids.get(i), name });
                }
            }
            for (const { id, name } of pending) {
                const mesh = byName.get(name);
                if (mesh != null) applyVoxelShapeResolve(t, { id, name, mesh });
            }
        },
    },
    systems: {
        voxelShapeLoadSystem: {
            schedule: { during: ["preUpdate"] },
            create: db => () => {
                const baseUrl = db.store.resources._voxelShapeBaseUrl;
                const byName = db.store.resources._voxelShapeByName ??= new Map();
                const inFlight = db.store.resources._voxelShapeLoadInFlight ??= new Set();

                const unresolved: { id: Entity; name: string }[] = [];
                for (const arch of db.store.queryArchetypes(
                    ["voxelShapeName"],
                    { exclude: ["voxelShape"] },
                )) {
                    const ids = arch.columns.id;
                    const names = arch.columns.voxelShapeName;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const name = names.get(i);
                        if (name) unresolved.push({ id: ids.get(i), name });
                    }
                }

                for (const { id, name } of unresolved) {
                    const cached = byName.get(name);
                    if (cached != null) {
                        applyVoxelShapeResolve(db.store, { id, name, mesh: cached });
                    }
                }

                const toFetch = new Set<string>();
                for (const { name } of unresolved) {
                    if (byName.has(name) || inFlight.has(name)) continue;
                    toFetch.add(name);
                }

                for (const name of toFetch) {
                    inFlight.add(name);
                    const url = resolveShapeUrl(baseUrl, name);
                    fetch(url)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Failed to fetch ${url}: ${response.status}`);
                            }
                            return response.json();
                        })
                        .then(json => {
                            const volume = parseVoxelShapeFile(json);
                            db.transactions.registerVoxelShapeFromVolume({ name, volume });
                            db.transactions.resolvePendingVoxelShapes();
                        })
                        .catch(err => {
                            console.error("[voxelShapeLoader] Failed to load shape", name, err);
                        })
                        .finally(() => {
                            inFlight.delete(name);
                        });
                }
            },
        },
    },
});
