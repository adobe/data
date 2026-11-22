// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, System } from "@adobe/ecs";
import { baseColor, isPaint, Material, metallic, name, roughness } from "../../../materials/model/index.js";
import { Instance, instance, instanceOf, material, Model, model, modelName, paint, paintedFaces, parent, position, rotation, scale, size, sizeUnlocked, source, Voxel, voxel } from "../../../voxels/model/index.js";
import type { Plan } from "./type.plan.js";

/** What `applyPlan` spawns through, from a system's `commands`, merging into the document's `materials`. */
export const planWorld = (commands: System.Commands, materials: readonly { readonly name: string; readonly entity: Entity }[]) => {
    const spawnMaterial = commands.spawn(Material);
    const spawnPaint = commands.spawn([...Material, isPaint]);
    const spawnLocal = commands.spawn(Model);
    const spawnReferenced = commands.spawn([...Model, source]);
    const spawnVoxel = commands.spawn(Voxel);
    const spawnInstance = commands.spawn(Instance);
    return {
        materials,
        spawnMaterial: (each: Plan["materials"][number]): Entity => {
            const values = { [name]: each.name, [baseColor]: each.baseColor, [metallic]: each.metallic, [roughness]: each.roughness };
            return each.paint === true ? spawnPaint({ ...values, [isPaint]: true }) : spawnMaterial(values);
        },
        spawnModel: (each: Plan["models"][number]): Entity => each.source === null
            ? spawnLocal({ [model]: true, [modelName]: each.name, [size]: each.size, [scale]: each.scale })
            : spawnReferenced({ [model]: true, [modelName]: each.name, [size]: each.size, [scale]: each.scale, [source]: each.source }),
        unlockSize: (held: Entity): void => commands.add(held, sizeUnlocked, true),
        spawnVoxel: (holder: Entity, cell: readonly [number, number, number], filling: Entity, coat: Entity, sides: number): void => {
            spawnVoxel({ [voxel]: true, [position]: cell, [material]: filling, [paint]: coat, [paintedFaces]: sides, [parent]: holder });
        },
        spawnInstance: (holder: Entity, of: Entity, at: readonly [number, number, number], turned: readonly [number, number, number, number]): void => {
            spawnInstance({ [instance]: true, [instanceOf]: of, [parent]: holder, [position]: at, [rotation]: turned });
        },
    };
};
