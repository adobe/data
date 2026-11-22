// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { baseColor, isPaint, Material, materials, metallic, name, roughness } from "../../materials/model/index.js";
import { namedSelections } from "../../selection/model/index.js";
import { instanceOf, instancesIn, mainModel, material, modelName, models, paint, paintedFaces, position, rotation, scale, size, sizeUnlocked, source, voxels } from "../../voxels/model/index.js";
import { encodeRuns } from "./system.serialize-document/function.encode-runs.js";
import type { VoxelFile } from "./type.voxel-file.js";

/**
 * The document's files, as texts by path, to save: its own file, at `path`, holding its own models, all its
 * materials and the main model's saved selections; and each referenced model's library file, holding the models kept
 * there. A model placed from another file is a reference to it. `standalone` keeps every model in the document's own
 * file, at `path`, so it reads with no library. A voxel's paint is kept only where it paints a face. Each file has the `thumbnails` of its models, by name.
 */
export const serializeDocument: System<
    { readonly path: string; readonly standalone: boolean; readonly thumbnails: readonly (readonly [string, string])[] },
    readonly { readonly path: string; readonly text: string }[]
> = System.create({
    lookup: {
        models: { index: models },
        sources: { with: [source] },
        unlocked: { with: [sizeUnlocked] },
        voxels: { index: voxels },
        placed: { index: instancesIn },
        materials: { with: [...Material], optional: [isPaint] },
        allMaterials: { index: materials },
    },
}, ({ lookup, resources }, input: { readonly path: string; readonly standalone: boolean; readonly thumbnails: readonly (readonly [string, string])[] }) => {
    const own = input.path;
    const thumbnails = new Map(input.thumbnails);
    const all = lookup.models();
    const named = new Map<Entity, string>();
    for (let i = 0; i < all.length; i++) named.set(all.at(i).entity, all.at(i)[modelName]);
    const sourceOf = (model: Entity): string | null => input.standalone ? null : lookup.sources(model)?.[source] ?? null;
    const fileOf = (model: Entity): string => sourceOf(model)?.split("#")[0] ?? own;
    const nameIn = (model: Entity): string => {
        const kept = sourceOf(model);
        return kept?.includes("#") === true ? kept.split("#")[1] ?? "" : named.get(model) ?? "";
    };
    const refOf = (model: Entity): string => sourceOf(model) ?? own;
    const materialOf = (entity: Entity): VoxelFile["materials"][number] | null => {
        const row = lookup.materials(entity);
        return row === null ? null : {
            name: row[name], baseColor: [row[baseColor][0], row[baseColor][1], row[baseColor][2], row[baseColor][3]],
            metallic: row[metallic], roughness: row[roughness], ...row[isPaint] === true ? { paint: true } : {},
        };
    };
    const files = new Map<string, { main: string; materials: Map<string, VoxelFile["materials"][number]>; models: Record<string, VoxelFile["models"][string]>; thumbnails: Record<string, string> }>();
    const fileAt = (path: string) => {
        let found = files.get(path);
        if (found === undefined) {
            found = { main: "", materials: new Map(), models: {}, thumbnails: {} };
            files.set(path, found);
        }
        return found;
    };
    const main = resources[mainModel];
    fileAt(own).main = named.get(main) ?? "main";
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        const path = fileOf(row.entity);
        const file = fileAt(path);
        if (sourceOf(row.entity) === path) file.main = nameIn(row.entity);
        const cells = new Map<string, string>();
        const coats = new Map<string, string>();
        const shown = lookup.voxels(row.entity);
        for (let k = 0; k < shown.length; k++) {
            const each = shown.at(k);
            const filling = materialOf(each[material]);
            if (filling === null) continue;
            file.materials.set(filling.name, filling);
            const [x, y, z] = each[position];
            cells.set(`${x},${y},${z}`, filling.name);
            const coat = each[paintedFaces] === 0 ? null : materialOf(each[paint]);
            if (coat === null) continue;
            file.materials.set(coat.name, coat);
            coats.set(`${x},${y},${z}`, `${each[paintedFaces]} ${coat.name}`);
        }
        const extent: readonly [number, number, number] = [row[size][0], row[size][1], row[size][2]];
        const placedHere = lookup.placed(row.entity);
        const placements: { model: string; position: readonly [number, number, number]; rotation: readonly [number, number, number, number] }[] = [];
        for (let k = 0; k < placedHere.length; k++) {
            const each = placedHere.at(k);
            const of = each[instanceOf];
            if (fileOf(of) !== path) file.models[nameIn(of)] = { ref: refOf(of) };
            const at = each[position];
            const turned = each[rotation];
            placements.push({ model: nameIn(of), position: [at[0], at[1], at[2]], rotation: [turned[0], turned[1], turned[2], turned[3]] });
        }
        const selections = row.entity === main ? Object.fromEntries(resources[namedSelections] ?? []) : undefined;
        file.models[nameIn(row.entity)] = {
            size: extent,
            scale: [row[scale][0], row[scale][1], row[scale][2]],
            ...lookup.unlocked(row.entity) === null ? {} : { unlocked: true },
            voxels: encodeRuns(extent, (x, y, z) => cells.get(`${x},${y},${z}`) ?? null),
            ...coats.size === 0 ? {} : { paints: encodeRuns(extent, (x, y, z) => coats.get(`${x},${y},${z}`) ?? null) },
            instances: placements,
            ...selections === undefined ? {} : { selections },
        };
        const thumbnail = thumbnails.get(named.get(row.entity) ?? "");
        if (thumbnail !== undefined) file.thumbnails[nameIn(row.entity)] = thumbnail;
    }
    // The document's own file keeps every material, those its models don't use yet too.
    const every = lookup.allMaterials();
    for (let i = 0; i < every.length; i++) {
        const filling = materialOf(every.at(i).entity);
        if (filling !== null) fileAt(own).materials.set(filling.name, filling);
    }
    return [...files].map(([path, file]) => {
        const voxelFile: VoxelFile = {
            format: "adobe-voxel", version: 1, main: file.main,
            materials: [...file.materials.values()], models: file.models, thumbnails: file.thumbnails,
        };
        return { path, text: JSON.stringify(voxelFile, null, 1) };
    });
});
