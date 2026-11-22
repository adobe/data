// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, workers, World } from "@adobe/ecs";
import { baseColor, copyMaterial, materials, materialsRevision, metallic, name, renameMaterial, seedMaterials, selectedMaterial, updateMaterial } from "./index.js";

const read = System.create({ readonly: true, lookup: { materials: { index: materials } } }, ({ lookup, resources }) => {
    const all = lookup.materials();
    const found: { name: string; metallic: number; red: number; selected: boolean }[] = [];
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        found.push({ name: row[name], metallic: Math.round(row[metallic] * 100) / 100, red: Math.round(row[baseColor][0] * 100) / 100, selected: row.entity === resources[selectedMaterial] });
    }
    return { materials: found, revision: resources[materialsRevision] };
});

it("copies a material as a new one, selected, renames it, refusing a taken name or one differing only in case, and edits it", async () => {
    await using world = World.create({ [workers]: 0 });
    await world.run(seedMaterials);
    const stone = (await world.run(read)).materials.find(each => each.name === "stone");
    expect(stone?.selected).toBe(true);
    const copied = await world.run(copyMaterial, { entity: await world.run(System.create({ readonly: true }, ({ resources }) => resources[selectedMaterial])) });
    expect((await world.run(read)).materials.filter(each => each.selected).map(each => each.name)).toEqual(["stone 2"]);
    expect(await world.run(renameMaterial, { entity: copied, name: "wood" })).toBe('There\'s already a material "wood".');
    expect(await world.run(renameMaterial, { entity: copied, name: "Stone" })).toBe('"Stone" differs from the material "stone" only in case.');
    expect(await world.run(renameMaterial, { entity: copied, name: "granite" })).toBeNull();
    await world.run(updateMaterial, { entity: copied, baseColor: [0.9, 0.1, 0.1, 1], metallic: 0.5, roughness: 0.4 });
    const after = await world.run(read);
    expect(after.materials.find(each => each.name === "granite")).toMatchObject({ metallic: 0.5, red: 0.9, selected: true });
    expect(after.materials.find(each => each.name === "stone")).toMatchObject({ metallic: 0.05 });
    expect(after.revision).toBe(2);
});
