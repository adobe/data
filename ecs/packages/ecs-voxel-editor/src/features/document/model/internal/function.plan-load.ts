// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { VoxelFile } from "../type.voxel-file.js";
import type { Plan } from "./type.plan.js";

/**
 * What loading `root`, a file's path and the model in it, `null` for its main one, spawns, with every model it reaches
 * through references in `files`, by path. The document's own models are those of `document`'s file, which have no
 * `source`; a referenced file's main model has its path as its source, and another model it holds `path#name`.
 * Names already `taken` in the document, or by an earlier file, get a number. Returns the plan and the key of `root`'s
 * model.
 */
export const planLoad = (files: ReadonlyMap<string, VoxelFile>, root: { readonly path: string; readonly name: string | null }, document: string | null, taken: ReadonlySet<string>): { readonly plan: Plan; readonly key: string | null } => {
    const materials: Plan["materials"][number][] = [];
    const materialNames = new Set<string>();
    const models: Plan["models"][number][] = [];
    const errors: string[] = [];
    const names = new Set(taken);
    const planned = new Map<string, string | null>();
    const unique = (name: string): string => {
        let candidate = name;
        for (let n = 2; names.has(candidate); n++) candidate = `${name} ${n}`;
        names.add(candidate);
        return candidate;
    };
    /** The key of the model `name` of the file at `path`, its main one for null, planning it and what it reaches first; null for one missing. */
    const visit = (path: string, wanted: string | null): string | null => {
        const file = files.get(path);
        if (file === undefined) {
            errors.push(`Missing file ${path}.`);
            return null;
        }
        const name = wanted ?? file.main;
        const key = `${path}#${name}`;
        if (planned.has(key)) return planned.get(key) ?? null;
        const entry = file.models[name];
        if (entry === undefined) {
            errors.push(`${path} has no model ${name}.`);
            planned.set(key, null);
            return null;
        }
        if ("ref" in entry) {
            const [refPath = "", refName] = entry.ref.split("#");
            const resolved = visit(refPath, refName ?? null);
            planned.set(key, resolved);
            return resolved;
        }
        planned.set(key, key);
        for (const material of file.materials) {
            if (materialNames.has(material.name)) continue;
            materialNames.add(material.name);
            materials.push(material);
        }
        const instances = entry.instances.flatMap(placed => {
            const target = visit(path, placed.model);
            return target === null ? [] : [{ model: target, position: placed.position, rotation: placed.rotation }];
        });
        models.push({
            key,
            name: unique(name),
            source: path === document ? null : name === file.main ? path : `${path}#${name}`,
            size: entry.size,
            scale: entry.scale,
            unlocked: entry.unlocked === true,
            voxels: entry.voxels,
            paints: entry.paints ?? null,
            instances,
            selections: entry.selections ?? {},
        });
        return key;
    };
    const key = visit(root.path, root.name);
    return { plan: { materials, models, errors }, key };
};
