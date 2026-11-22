// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, type Vec3 } from "@adobe/ecs";
import { paintModel } from "../../../edit/model/index.js";
import { library } from "../../../library/model/index.js";
import { baseColor, isPaint, layer, materials, materialsRevision, name, selectedMaterial, selectedPaint } from "../../../materials/model/index.js";
import { drawThumbnail, modelLooks } from "../../../thumbnails/view/index.js";
import { instanceOf, instancesIn, mainModel, material, modelName, models, paint, size, voxels } from "../../../voxels/model/index.js";
import type { PaletteItem, PaletteSection } from "../../elements/index.js";
import { favorites, paletteFilter, type PaletteFilter } from "../../model/index.js";
import { palettePanel } from "./resource.palette-panel.js";

/**
 * Writes the palette's sections, as what they show changes: what the document uses, the user's favorites, every
 * material, the document's models, and the library's files by folder, each kept to what the filter shows; in paint
 * mode, the paints alone.
 */
export const bindPalettePanel: System = System.create({
    readonly: true,
    resources: { is: [palettePanel], changed: [palettePanel, paletteFilter, favorites, selectedMaterial, selectedPaint, layer, paintModel, library, modelLooks, mainModel, materialsRevision] },
    lookup: {
        materials: { index: materials, changed: true },
        paints: { with: [isPaint] },
        models: { index: models, changed: true },
        voxels: { index: voxels, changed: true },
        placed: { index: instancesIn, changed: true },
    },
}, ({ resources, lookup }) => {
    const filter = resources[paletteFilter];
    const liked = resources[favorites] ?? new Set<string>();
    const looks = resources[modelLooks];
    const all: PaletteItem[] = [];
    const sizes = new Map<string, Vec3>();
    const known = lookup.materials();
    const materialKey = new Map<Entity, string>();
    const painting = resources[layer] === "paint";
    for (let i = 0; i < known.length; i++) {
        const row = known.at(i);
        // Paint mode lists only paints; building, only what voxels are made of.
        if ((lookup.paints(row.entity) !== null) !== painting) continue;
        const key = `material:${row[name]}`;
        materialKey.set(row.entity, key);
        const [r, g, b] = row[baseColor];
        const selected = painting ? resources[selectedPaint] === row.entity : resources[paintModel] === Entity.none && resources[selectedMaterial] === row.entity;
        all.push({ key, label: row[name], color: `rgb(${channel(r)} ${channel(g)} ${channel(b)})`, selected, favorite: liked.has(key) });
    }
    const listed = lookup.models();
    const modelKey = new Map<Entity, string>();
    for (let i = 0; !painting && i < listed.length; i++) {
        const row = listed.at(i);
        const key = `model:${row[modelName]}`;
        modelKey.set(row.entity, key);
        sizes.set(key, row[size]);
        const look = looks?.get(row.entity);
        all.push({
            key, label: row[modelName], selected: resources[paintModel] === row.entity, favorite: liked.has(key),
            ...look === undefined ? {} : { draw: (canvas: HTMLCanvasElement, angle: number) => drawThumbnail(canvas, look, angle), version: versionOf(look.cubes) },
        });
    }
    const files: PaletteItem[] = painting ? [] : resources[library].entries.map(entry => {
        const key = `file:${entry.path}`;
        sizes.set(key, entry.size);
        return { key, label: entry.name, folder: entry.folder, selected: false, favorite: liked.has(key), ...entry.thumbnail === null ? {} : { image: entry.thumbnail } };
    });
    const used = new Set<string>();
    const filled = lookup.voxels();
    for (let i = 0; i < filled.length; i++) used.add(materialKey.get(filled.at(i)[painting ? paint : material]) ?? "");
    const placed = lookup.placed();
    for (let i = 0; i < placed.length; i++) used.add(modelKey.get(placed.at(i)[instanceOf]) ?? "");
    const shown = (item: PaletteItem): boolean => passes(filter, item, sizes.get(item.key));
    const everything = [...all, ...files];
    const sections: PaletteSection[] = [
        { title: "In this document", items: all.filter(item => used.has(item.key) && shown(item)) },
        { title: "Favorites", items: everything.filter(item => item.favorite && shown(item)) },
        { title: painting ? "Paints" : "Materials", items: all.filter(item => item.key.startsWith("material:") && shown(item)) },
        { title: "Models", items: all.filter(item => item.key.startsWith("model:") && item.key !== modelKey.get(resources[mainModel]) && shown(item)) },
        { title: "Library", items: files.filter(shown) },
    ];
    resources[palettePanel].sections = sections;
});

/** Whether the filter shows an item, a model's or file's longest side `size` in voxels. */
const passes = (filter: PaletteFilter, item: PaletteItem, extent: Vec3 | undefined): boolean => {
    const isMaterial = item.key.startsWith("material:");
    if (filter.kind === "materials" && !isMaterial) return false;
    if (filter.kind === "models" && isMaterial) return false;
    if (filter.size !== "any") {
        if (extent === undefined) return false;
        const longest = Math.max(extent[0], extent[1], extent[2]);
        const range = filter.size === "small" ? longest <= 8 : filter.size === "medium" ? longest > 8 && longest <= 32 : longest > 32;
        if (!range) return false;
    }
    const search = filter.search.trim().toLowerCase();
    return search === "" || item.label.toLowerCase().includes(search) || item.key.toLowerCase().includes(search);
};

/** A number that changes as a model's look does, for the palette to redraw its thumbnail. */
const versionOf = (cubes: readonly { readonly at: readonly [number, number, number]; readonly color: string }[]): number =>
    cubes.reduce((sum, cube, i) => (sum + (i + 1) * (cube.at[0] * 3 + cube.at[1] * 5 + cube.at[2] * 7 + cube.color.length)) % 1_000_000_007, cubes.length);

/** A linear color channel, from 0 to 1, as an sRGB byte. */
const channel = (linear: number): number => Math.round(255 * Math.min(Math.max(linear, 0), 1) ** (1 / 2.2));
