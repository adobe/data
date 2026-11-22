// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, type Vec3 } from "@adobe/ecs";
import { Model } from "./archetype.model.js";
import { editingOf } from "./function.editing-of.js";
import { model } from "./component.model.js";
import { modelName } from "./component.model-name.js";
import { scale } from "./component.scale.js";
import { size } from "./component.size.js";
import { models } from "./index.models.js";
import { editing } from "./resource.editing.js";
import { mainModel } from "./resource.main-model.js";

/**
 * Starts a new document: despawns every model, and with them their voxels, instances and faces, and makes a main model
 * named `main`, `size` voxels each `scale` world units, editing it; returns it.
 */
export const newDocument: System<{ readonly size: Vec3; readonly scale: Vec3 }, Entity> = System.create({
    lookup: { models: { index: models } },
}, ({ lookup, commands, resources }, input: { readonly size: Vec3; readonly scale: Vec3 }) => {
    const all = lookup.models();
    for (let i = 0; i < all.length; i++) commands.despawn(all.at(i).entity);
    const main = commands.spawn(Model)({ [model]: true, [modelName]: "main", [size]: input.size, [scale]: input.scale });
    resources[mainModel] = main;
    resources[editing] = editingOf(main, [], main);
    return main;
});
